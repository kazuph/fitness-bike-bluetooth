#!/usr/bin/env python3
"""
Fitness Bike Controller using Python bleak library
This implementation provides comprehensive debugging for FTMS resistance control
"""

import asyncio
import struct
import sys
from bleak import BleakClient, BleakScanner
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class FitnessBikeController:
    def __init__(self):
        # Bluetooth UUIDs
        self.FITNESS_MACHINE_SERVICE = "00001826-0000-1000-8000-00805f9b34fb"
        self.INDOOR_BIKE_DATA_CHAR = "00002ad2-0000-1000-8000-00805f9b34fb"
        self.CONTROL_POINT_CHAR = "00002ad9-0000-1000-8000-00805f9b34fb"
        self.FITNESS_MACHINE_FEATURE_CHAR = "00002acc-0000-1000-8000-00805f9b34fb"
        self.FITNESS_MACHINE_STATUS_CHAR = "00002ada-0000-1000-8000-00805f9b34fb"
        
        self.client = None
        self.is_connected = False
        self.is_monitoring = False
        
        # Control point tracking
        self.last_control_command = None
        self.control_responses = []
    
    async def scan_devices(self):
        """Scan for fitness bike devices"""
        logger.info("🔍 Bluetoothデバイスをスキャン中...")
        
        devices = await BleakScanner.discover(timeout=10.0)
        target_devices = []
        
        for device in devices:
            # Check for MG03 or devices with Fitness Machine Service
            if (device.name and "MG03" in device.name) or \
               (device.metadata and 'uuids' in device.metadata and 
                self.FITNESS_MACHINE_SERVICE.lower() in [uuid.lower() for uuid in device.metadata['uuids']]):
                target_devices.append(device)
                logger.info(f"🎯 ターゲットデバイス発見: {device.name} ({device.address})")
        
        if not target_devices:
            logger.warning("⚠️ フィットネスバイクが見つかりません")
            # Show all devices for debugging
            logger.info("発見されたデバイス:")
            for device in devices:
                logger.info(f"  - {device.name or 'Unknown'} ({device.address})")
        
        return target_devices
    
    async def connect(self, device_address=None):
        """Connect to fitness bike"""
        try:
            if device_address is None:
                devices = await self.scan_devices()
                if not devices:
                    return False
                device_address = devices[0].address
                logger.info(f"🔗 自動選択: {devices[0].name} ({device_address})")
            
            logger.info(f"🔗 接続中: {device_address}")
            
            self.client = BleakClient(device_address)
            await self.client.connect()
            
            if self.client.is_connected:
                self.is_connected = True
                logger.info("✅ GATT接続成功")
                
                await self.discover_services()
                await self.setup_monitoring()
                return True
            else:
                logger.error("❌ 接続失敗")
                return False
                
        except Exception as e:
            logger.error(f"❌ 接続エラー: {e}")
            return False
    
    async def discover_services(self):
        """Discover services and characteristics"""
        try:
            services = self.client.services
            
            logger.info("🔧 発見されたサービス:")
            for service in services:
                logger.info(f"  サービス: {service.uuid}")
                
                if service.uuid.lower() == self.FITNESS_MACHINE_SERVICE.lower():
                    logger.info("  🎯 Fitness Machine Service発見!")
                    
                    for char in service.characteristics:
                        props = [prop for prop in ['read', 'write', 'notify', 'indicate'] 
                                if prop in char.properties]
                        logger.info(f"    特性: {char.uuid} ({', '.join(props)})")
                        
                        # Check specific characteristics
                        if char.uuid.lower() == self.INDOOR_BIKE_DATA_CHAR.lower():
                            logger.info("    → Indoor Bike Data特性")
                        elif char.uuid.lower() == self.CONTROL_POINT_CHAR.lower():
                            logger.info("    → Control Point特性")
                        elif char.uuid.lower() == self.FITNESS_MACHINE_FEATURE_CHAR.lower():
                            logger.info("    → Fitness Machine Feature特性")
                            await self.read_features(char.uuid)
                        elif char.uuid.lower() == self.FITNESS_MACHINE_STATUS_CHAR.lower():
                            logger.info("    → Fitness Machine Status特性")
        
        except Exception as e:
            logger.error(f"❌ サービス探索エラー: {e}")
    
    async def read_features(self, char_uuid):
        """Read fitness machine features"""
        try:
            data = await self.client.read_gatt_char(char_uuid)
            logger.info(f"💪 Fitness Machine Features: {data.hex()}")
            
            if len(data) >= 8:
                features1 = struct.unpack('<I', data[0:4])[0]
                features2 = struct.unpack('<I', data[4:8])[0]
                
                # Check resistance control support
                resistance_level_supported = bool(features1 & (1 << 3))
                power_target_supported = bool(features1 & (1 << 4))
                indoor_bike_simulation_supported = bool(features1 & (1 << 5))
                
                logger.info(f"  抵抗レベル制御: {'✅' if resistance_level_supported else '❌'}")
                logger.info(f"  パワー目標制御: {'✅' if power_target_supported else '❌'}")
                logger.info(f"  インドアバイクシミュレーション: {'✅' if indoor_bike_simulation_supported else '❌'}")
        
        except Exception as e:
            logger.error(f"❌ Features読み取りエラー: {e}")
    
    async def setup_monitoring(self):
        """Setup data monitoring"""
        try:
            # Monitor Indoor Bike Data
            await self.client.start_notify(self.INDOOR_BIKE_DATA_CHAR, self.handle_indoor_bike_data)
            logger.info("📊 Indoor Bike Data監視開始")
            
            # Monitor Control Point responses
            try:
                await self.client.start_notify(self.CONTROL_POINT_CHAR, self.handle_control_point_response)
                logger.info("🎛️ Control Point応答監視開始")
            except Exception as e:
                logger.warning(f"⚠️ Control Point監視設定失敗: {e}")
            
            self.is_monitoring = True
            
        except Exception as e:
            logger.error(f"❌ 監視設定エラー: {e}")
    
    def handle_indoor_bike_data(self, sender, data):
        """Handle Indoor Bike Data notifications"""
        try:
            logger.info(f"📊 Indoor Bike Data受信:")
            logger.info(f"  生データ: {data.hex()}")
            
            if len(data) < 2:
                logger.warning("  ⚠️ データが短すぎます")
                return
            
            flags = struct.unpack('<H', data[0:2])[0]
            offset = 2
            
            logger.info(f"  フラグ: 0x{flags:04x} ({flags:016b})")
            
            # Parse data based on flags
            metrics = {}
            
            # Instantaneous Speed (always present)
            if offset + 2 <= len(data):
                speed = struct.unpack('<H', data[offset:offset+2])[0] * 0.01
                metrics['速度'] = f"{speed:.1f} km/h"
                offset += 2
            
            # Average Speed (bit 1)
            if (flags & 0x02) and offset + 2 <= len(data):
                avg_speed = struct.unpack('<H', data[offset:offset+2])[0] * 0.01
                metrics['平均速度'] = f"{avg_speed:.1f} km/h"
                offset += 2
            
            # Instantaneous Cadence (bit 2)
            if (flags & 0x04) and offset + 2 <= len(data):
                cadence = struct.unpack('<H', data[offset:offset+2])[0] * 0.5
                metrics['ケイデンス'] = f"{cadence:.0f} rpm"
                offset += 2
            
            # Average Cadence (bit 3)
            if (flags & 0x08) and offset + 2 <= len(data):
                avg_cadence = struct.unpack('<H', data[offset:offset+2])[0] * 0.5
                metrics['平均ケイデンス'] = f"{avg_cadence:.0f} rpm"
                offset += 2
            
            # Total Distance (bit 4)
            if (flags & 0x10) and offset + 3 <= len(data):
                distance = (data[offset] | (data[offset+1] << 8) | (data[offset+2] << 16))
                if distance < 1000:
                    metrics['距離'] = f"{distance} m"
                else:
                    metrics['距離'] = f"{distance/1000:.2f} km"
                offset += 3
            
            # Resistance Level (bit 5)
            if (flags & 0x20) and offset + 2 <= len(data):
                resistance = struct.unpack('<h', data[offset:offset+2])[0]
                metrics['抵抗レベル'] = str(resistance)
                offset += 2
            
            # Instantaneous Power (bit 6)
            if (flags & 0x40) and offset + 2 <= len(data):
                power = struct.unpack('<h', data[offset:offset+2])[0]
                if 0 <= power <= 2000:  # Valid power range
                    metrics['パワー'] = f"{power} W"
                else:
                    metrics['パワー'] = f"{power} W (範囲外)"
                offset += 2
            
            # Average Power (bit 7)
            if (flags & 0x80) and offset + 2 <= len(data):
                avg_power = struct.unpack('<h', data[offset:offset+2])[0]
                metrics['平均パワー'] = f"{avg_power} W"
                offset += 2
            
            # Display metrics
            for key, value in metrics.items():
                logger.info(f"  {key}: {value}")
            
            logger.info("")
            
        except Exception as e:
            logger.error(f"❌ データパースエラー: {e}")
    
    def handle_control_point_response(self, sender, data):
        """Handle Control Point response"""
        try:
            logger.info(f"🎛️ Control Point応答:")
            logger.info(f"  生データ: {data.hex()}")
            
            if len(data) >= 3:
                response_code = data[0]
                request_opcode = data[1]
                result_code = data[2]
                
                result_map = {
                    0x01: 'SUCCESS',
                    0x02: 'NOT_SUPPORTED',
                    0x03: 'INVALID_PARAMETER',
                    0x04: 'OPERATION_FAILED',
                    0x05: 'CONTROL_NOT_PERMITTED'
                }
                
                result = result_map.get(result_code, f'UNKNOWN({result_code})')
                
                logger.info(f"  応答コード: 0x{response_code:02x}")
                logger.info(f"  要求OpCode: 0x{request_opcode:02x}")
                logger.info(f"  結果: {result} (0x{result_code:02x})")
                
                # Store response for analysis
                self.control_responses.append({
                    'response_code': response_code,
                    'request_opcode': request_opcode,
                    'result_code': result_code,
                    'result': result,
                    'raw_data': data.hex()
                })
                
            logger.info("")
            
        except Exception as e:
            logger.error(f"❌ Control Point応答パースエラー: {e}")
    
    async def set_resistance_level(self, level):
        """Set resistance level using multiple methods"""
        if not self.is_connected:
            logger.error("❌ デバイスが接続されていません")
            return False
        
        logger.info(f"🔧 負荷レベル設定: {level}")
        
        # Method 1: Set Target Resistance Level (OpCode 0x04)
        success1 = await self._send_resistance_command(level)
        
        # Wait for response
        await asyncio.sleep(1)
        
        # Method 2: Set Target Power (OpCode 0x05) - as alternative
        power_target = level * 15  # Convert resistance to power estimate
        success2 = await self._send_power_command(power_target)
        
        # Wait for response
        await asyncio.sleep(1)
        
        # Method 3: Indoor Bike Simulation (OpCode 0x11) - using grade
        grade = (level - 1) * 0.5  # Convert to grade percentage
        success3 = await self._send_simulation_command(grade)
        
        return success1 or success2 or success3
    
    async def _send_resistance_command(self, level):
        """Send resistance level command"""
        try:
            command = struct.pack('<BHH', 0x04, level, 0)[:3]  # OpCode 0x04 + level
            
            logger.info(f"📡 抵抗コマンド送信: {command.hex()}")
            self.last_control_command = command.hex()
            
            await self.client.write_gatt_char(self.CONTROL_POINT_CHAR, command)
            logger.info("✅ 抵抗コマンド送信完了")
            return True
            
        except Exception as e:
            logger.error(f"❌ 抵抗コマンド送信エラー: {e}")
            return False
    
    async def _send_power_command(self, watts):
        """Send power target command"""
        try:
            command = struct.pack('<BH', 0x05, watts)
            
            logger.info(f"📡 パワーコマンド送信: {command.hex()} ({watts}W)")
            self.last_control_command = command.hex()
            
            await self.client.write_gatt_char(self.CONTROL_POINT_CHAR, command)
            logger.info("✅ パワーコマンド送信完了")
            return True
            
        except Exception as e:
            logger.error(f"❌ パワーコマンド送信エラー: {e}")
            return False
    
    async def _send_simulation_command(self, grade_percent):
        """Send indoor bike simulation command"""
        try:
            # OpCode 0x11: Set Indoor Bike Simulation Parameters
            # Wind speed (0), Grade (0.01% units), Rolling resistance (0), Wind resistance (0)
            grade_int = int(grade_percent * 100)  # Convert to 0.01% units
            command = struct.pack('<BhhHH', 0x11, 0, grade_int, 0, 0)
            
            logger.info(f"📡 シミュレーションコマンド送信: {command.hex()} (勾配: {grade_percent:.1f}%)")
            self.last_control_command = command.hex()
            
            await self.client.write_gatt_char(self.CONTROL_POINT_CHAR, command)
            logger.info("✅ シミュレーションコマンド送信完了")
            return True
            
        except Exception as e:
            logger.error(f"❌ シミュレーションコマンド送信エラー: {e}")
            return False
    
    async def request_control(self):
        """Request control of the fitness machine"""
        try:
            command = struct.pack('<B', 0x00)  # OpCode 0x00: Request Control
            
            logger.info(f"🎛️ 制御要求送信: {command.hex()}")
            await self.client.write_gatt_char(self.CONTROL_POINT_CHAR, command)
            logger.info("✅ 制御要求送信完了")
            return True
            
        except Exception as e:
            logger.error(f"❌ 制御要求送信エラー: {e}")
            return False
    
    async def start_resume(self):
        """Start or resume the fitness machine"""
        try:
            command = struct.pack('<B', 0x07)  # OpCode 0x07: Start or Resume
            
            logger.info(f"▶️ 開始コマンド送信: {command.hex()}")
            await self.client.write_gatt_char(self.CONTROL_POINT_CHAR, command)
            logger.info("✅ 開始コマンド送信完了")
            return True
            
        except Exception as e:
            logger.error(f"❌ 開始コマンド送信エラー: {e}")
            return False
    
    def show_control_responses(self):
        """Show all control point responses"""
        if not self.control_responses:
            logger.info("📝 Control Point応答履歴なし")
            return
        
        logger.info("📝 Control Point応答履歴:")
        for i, resp in enumerate(self.control_responses):
            logger.info(f"  {i+1}. OpCode: 0x{resp['request_opcode']:02x}, "
                       f"結果: {resp['result']}, データ: {resp['raw_data']}")
    
    async def disconnect(self):
        """Disconnect from device"""
        if self.client and self.is_connected:
            try:
                if self.is_monitoring:
                    await self.client.stop_notify(self.INDOOR_BIKE_DATA_CHAR)
                    try:
                        await self.client.stop_notify(self.CONTROL_POINT_CHAR)
                    except:
                        pass
                    
                await self.client.disconnect()
                self.is_connected = False
                self.is_monitoring = False
                logger.info("❌ デバイスから切断")
                
            except Exception as e:
                logger.error(f"❌ 切断エラー: {e}")

async def main():
    """Main interactive loop"""
    controller = FitnessBikeController()
    
    print("🚴‍♂️ Fitness Bike Controller (Python + bleak)")
    print("利用可能なコマンド:")
    print("  scan      - デバイススキャン")
    print("  connect   - 接続")
    print("  control   - 制御要求")
    print("  start     - 開始/再開")
    print("  r1-80     - 負荷レベル設定 (例: r20)")
    print("  responses - Control Point応答履歴表示")
    print("  quit      - 終了")
    print()
    
    while True:
        try:
            command = input("> ").strip().lower()
            
            if command == 'scan':
                await controller.scan_devices()
            
            elif command == 'connect':
                await controller.connect()
            
            elif command == 'control':
                await controller.request_control()
            
            elif command == 'start':
                await controller.start_resume()
            
            elif command.startswith('r') and len(command) > 1:
                try:
                    level = int(command[1:])
                    if 1 <= level <= 80:
                        await controller.set_resistance_level(level)
                    else:
                        print("❌ 無効な負荷レベル (1-80)")
                except ValueError:
                    print("❌ 無効な数値")
            
            elif command == 'responses':
                controller.show_control_responses()
            
            elif command == 'quit':
                await controller.disconnect()
                break
            
            else:
                print("❌ 無効なコマンド")
        
        except KeyboardInterrupt:
            print("\n終了中...")
            await controller.disconnect()
            break
        except Exception as e:
            logger.error(f"❌ エラー: {e}")

if __name__ == "__main__":
    asyncio.run(main())