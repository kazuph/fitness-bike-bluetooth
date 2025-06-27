import noble from '@abandonware/noble';

export interface BikeMetrics {
  speed: number;
  averageSpeed: number;
  cadence: number;
  averageCadence: number;
  distance: number;
  power: number;
  averagePower: number;
  resistance: number;
  timestamp: Date;
}

export interface ConnectionStatus {
  isConnected: boolean;
  deviceName: string | null;
  deviceId: string | null;
  isMonitoring: boolean;
  lastDataReceived: Date | null;
}

export interface OperationResult {
  success: boolean;
  error?: string;
  deviceName?: string;
  data?: any;
}

export class AerobikeController {
  private device: any = null;
  private indoorBikeDataCharacteristic: any = null;
  private controlPointCharacteristic: any = null;
  private isConnected: boolean = false;
  private isMonitoring: boolean = false;
  private currentMetrics: BikeMetrics;
  private discoveredDevices: Map<string, any> = new Map();
  private currentScanResolver: ((value: OperationResult) => void) | null = null;
  private scanTimeout: NodeJS.Timeout | null = null;
  
  // 距離計算用
  private lastDistanceUpdateTime: number | null = null;
  private calculatedDistance: number = 0;
  private distanceCalculationEnabled: boolean = false;
  
  // 平均値計算用
  private speedHistory: number[] = [];
  private cadenceHistory: number[] = [];
  private maxHistoryLength: number = 10;

  // Bluetooth UUIDs
  private readonly FITNESS_MACHINE_SERVICE = '1826';
  private readonly INDOOR_BIKE_DATA_CHAR = '2ad2';
  private readonly CONTROL_POINT_CHAR = '2ad9';

  constructor() {
    this.currentMetrics = {
      speed: 0,
      averageSpeed: 0,
      cadence: 0,
      averageCadence: 0,
      distance: 0,
      power: 0,
      averagePower: 0,
      resistance: 0,
      timestamp: new Date()
    };

    // 距離計算の初期化
    this.lastDistanceUpdateTime = null;
    this.calculatedDistance = 0;
    this.distanceCalculationEnabled = true; // デフォルトで速度積分を有効

    this.setupNoble();
  }

  private setupNoble() {
    noble.on('stateChange', (state) => {
      console.log('📡 Bluetooth state:', state);
    });

    noble.on('discover', (peripheral) => {
      const localName = peripheral.advertisement.localName || 'Unknown';
      console.log(`🔍 Device discovered: ${localName} (${peripheral.id})`);

      // Check for MG03 or Fitness Machine Service
      const hasTargetService = peripheral.advertisement.serviceUuids.includes(this.FITNESS_MACHINE_SERVICE);
      const isTargetDevice = localName === 'MG03' || localName.includes('bike') || localName.includes('Bike');

      if (hasTargetService || isTargetDevice) {
        console.log(`🎯 Target device found: ${localName}`);
        this.discoveredDevices.set(peripheral.id, {
          peripheral,
          name: localName,
          id: peripheral.id,
          rssi: peripheral.rssi
        });

        // ターゲットデバイスが見つかったら即座にスキャンを終了
        if (this.currentScanResolver) {
          console.log('🚀 Target device found, ending scan immediately...');
          noble.stopScanning();
          
          const deviceCount = this.discoveredDevices.size;
          console.log(`✅ Scan completed early. Found ${deviceCount} compatible devices`);
          
          this.currentScanResolver({
            success: true,
            data: {
              devicesFound: deviceCount,
              devices: Array.from(this.discoveredDevices.values()).map(d => ({
                id: d.id,
                name: d.name,
                rssi: d.rssi
              }))
            }
          });
          
          this.currentScanResolver = null;
          if (this.scanTimeout) {
            clearTimeout(this.scanTimeout);
            this.scanTimeout = null;
          }
        }
      }
    });
  }

  async startScan(timeout: number = 30): Promise<OperationResult> {
    return new Promise((resolve) => {
      console.log('🔍 Scanning for Bluetooth devices...');
      this.discoveredDevices.clear();

      if ((noble as any).state !== 'poweredOn') {
        resolve({
          success: false,
          error: 'Bluetooth is not powered on'
        });
        return;
      }

      // 現在のスキャンresolverを保存
      this.currentScanResolver = resolve;

      noble.startScanning([this.FITNESS_MACHINE_SERVICE], false);

      // タイムアウトによる終了
      this.scanTimeout = setTimeout(() => {
        if (this.currentScanResolver) {
          noble.stopScanning();
          
          const deviceCount = this.discoveredDevices.size;
          console.log(`⏰ Scan completed by timeout. Found ${deviceCount} compatible devices`);
          
          this.currentScanResolver({
            success: true,
            data: {
              devicesFound: deviceCount,
              devices: Array.from(this.discoveredDevices.values()).map(d => ({
                id: d.id,
                name: d.name,
                rssi: d.rssi
              }))
            }
          });
          
          this.currentScanResolver = null;
          this.scanTimeout = null;
        }
      }, timeout * 1000);
    });
  }

  async connectToDevice(deviceId?: string): Promise<OperationResult> {
    try {
      let targetDevice;
      
      if (deviceId) {
        const device = this.discoveredDevices.get(deviceId);
        if (!device) {
          return {
            success: false,
            error: `Device with ID ${deviceId} not found`
          };
        }
        targetDevice = device;
      } else {
        // Connect to first available device
        const devices = Array.from(this.discoveredDevices.values());
        if (devices.length === 0) {
          return {
            success: false,
            error: 'No devices found. Please scan first.'
          };
        }
        targetDevice = devices[0];
      }

      const peripheral = targetDevice.peripheral;
      console.log(`🔗 Connecting to: ${targetDevice.name}`);

      peripheral.on('disconnect', () => {
        console.log('❌ Device disconnected');
        this.isConnected = false;
        this.isMonitoring = false;
      });

      await new Promise<void>((resolve, reject) => {
        peripheral.connect((error: any) => {
          if (error) reject(error);
          else resolve();
        });
      });

      console.log('✅ GATT connection successful');
      this.device = peripheral;
      this.isConnected = true;

      await this.discoverServices();

      return {
        success: true,
        deviceName: targetDevice.name
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Connection error:', errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  private async discoverServices(): Promise<void> {
    const services = await new Promise<any[]>((resolve, reject) => {
      this.device.discoverServices([this.FITNESS_MACHINE_SERVICE], (error: any, services: any[]) => {
        if (error) reject(error);
        else resolve(services);
      });
    });

    if (services.length === 0) {
      throw new Error('Fitness Machine Service not found');
    }

    const fitnessService = services[0];
    console.log('🔧 Fitness Machine Service discovered');

    const characteristics = await new Promise<any[]>((resolve, reject) => {
      fitnessService.discoverCharacteristics([], (error: any, characteristics: any[]) => {
        if (error) reject(error);
        else resolve(characteristics);
      });
    });

    console.log('📡 Discovered characteristics:');
    characteristics.forEach(char => {
      console.log(`  - ${char.uuid}: ${char.properties.join(', ')}`);

      if (char.uuid === this.INDOOR_BIKE_DATA_CHAR) {
        this.indoorBikeDataCharacteristic = char;
        console.log('  → Indoor Bike Data characteristic set');
      }

      if (char.uuid === this.CONTROL_POINT_CHAR) {
        this.controlPointCharacteristic = char;
        console.log('  → Control Point characteristic set');
      }
    });

    await this.setupDataMonitoring();
    await this.setupControlPoint();
  }

  private async setupDataMonitoring(): Promise<void> {
    if (!this.indoorBikeDataCharacteristic) {
      console.log('⚠️ Indoor Bike Data characteristic not available');
      return;
    }

    this.indoorBikeDataCharacteristic.on('data', (data: Buffer) => {
      this.parseIndoorBikeData(data);
    });

    await new Promise<void>((resolve, reject) => {
      this.indoorBikeDataCharacteristic.subscribe((error: any) => {
        if (error) reject(error);
        else resolve();
      });
    });

    console.log('📊 Indoor Bike Data monitoring started');
    this.isMonitoring = true;
  }

  private async setupControlPoint(): Promise<void> {
    if (!this.controlPointCharacteristic) {
      console.log('⚠️ Control Point characteristic not available');
      return;
    }

    this.controlPointCharacteristic.on('data', (data: Buffer) => {
      this.handleControlPointResponse(data);
    });

    if (this.controlPointCharacteristic.properties.includes('indicate')) {
      await new Promise<void>((resolve, reject) => {
        this.controlPointCharacteristic.subscribe((error: any) => {
          if (error) reject(error);
          else resolve();
        });
      });
      console.log('🎛️ Control Point response monitoring started');
    }
  }

  private parseIndoorBikeData(data: Buffer): void {
    const flags = data.readUInt16LE(0);
    let offset = 2;

    try {
      // Update timestamp
      this.currentMetrics.timestamp = new Date();

      // Instantaneous Speed (always present)
      if (offset + 2 <= data.length) {
        const speed = data.readUInt16LE(offset) * 0.01;
        this.currentMetrics.speed = speed;
        
        // 速度履歴を更新して平均値を計算
        this.updateSpeedHistory(speed);
        
        // 距離を積分計算で更新
        if (this.distanceCalculationEnabled) {
          this.updateCalculatedDistance(speed);
        }
        
        offset += 2;
      }

      // Average Speed (bit 1)
      if ((flags & 0x02) && offset + 2 <= data.length) {
        this.currentMetrics.averageSpeed = data.readUInt16LE(offset) * 0.01;
        offset += 2;
      } else {
        // ハードウェア平均値がない場合は計算値を使用
        this.currentMetrics.averageSpeed = this.calculateAverageSpeed();
      }

      // Instantaneous Cadence (bit 2)
      if ((flags & 0x04) && offset + 2 <= data.length) {
        const cadence = data.readUInt16LE(offset) * 0.5;
        this.currentMetrics.cadence = cadence;
        
        // ケイデンス履歴を更新
        this.updateCadenceHistory(cadence);
        
        offset += 2;
      }

      // Average Cadence (bit 3)
      if ((flags & 0x08) && offset + 2 <= data.length) {
        this.currentMetrics.averageCadence = data.readUInt16LE(offset) * 0.5;
        offset += 2;
      } else {
        // ハードウェア平均値がない場合は計算値を使用
        this.currentMetrics.averageCadence = this.calculateAverageCadence();
      }

      // Total Distance (bit 4)
      if ((flags & 0x10) && offset + 3 <= data.length) {
        const hardwareDistance = (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16));
        
        // ハードウェア距離が有効な場合のみ使用
        if (hardwareDistance > 0 && hardwareDistance < 999999) {
          this.currentMetrics.distance = hardwareDistance;
          this.distanceCalculationEnabled = false;
          console.log(`📏 Using hardware distance: ${hardwareDistance}m`);
        } else {
          // 無効な場合は計算距離を使用
          this.currentMetrics.distance = Math.round(this.calculatedDistance);
          console.log(`📏 Using calculated distance: ${Math.round(this.calculatedDistance)}m`);
        }
        offset += 3;
      } else {
        // 距離データがない場合は計算距離を使用
        this.currentMetrics.distance = Math.round(this.calculatedDistance);
      }

      // Resistance Level (bit 5)
      if ((flags & 0x20) && offset + 2 <= data.length) {
        this.currentMetrics.resistance = data.readInt16LE(offset);
        offset += 2;
      }

      // Instantaneous Power (bit 6)
      if ((flags & 0x40) && offset + 2 <= data.length) {
        this.currentMetrics.power = data.readInt16LE(offset);
        offset += 2;
      }

      // Average Power (bit 7)
      if ((flags & 0x80) && offset + 2 <= data.length) {
        this.currentMetrics.averagePower = data.readInt16LE(offset);
        offset += 2;
      }

    } catch (error) {
      console.error('❌ Data parsing error:', error);
    }
  }

  private updateSpeedHistory(speed: number): void {
    this.speedHistory.push(speed);
    if (this.speedHistory.length > this.maxHistoryLength) {
      this.speedHistory.shift();
    }
  }

  private updateCadenceHistory(cadence: number): void {
    this.cadenceHistory.push(cadence);
    if (this.cadenceHistory.length > this.maxHistoryLength) {
      this.cadenceHistory.shift();
    }
  }

  private calculateAverageSpeed(): number {
    if (this.speedHistory.length === 0) return 0;
    const sum = this.speedHistory.reduce((acc, speed) => acc + speed, 0);
    return sum / this.speedHistory.length;
  }

  private calculateAverageCadence(): number {
    if (this.cadenceHistory.length === 0) return 0;
    const sum = this.cadenceHistory.reduce((acc, cadence) => acc + cadence, 0);
    return sum / this.cadenceHistory.length;
  }

  private updateCalculatedDistance(speed: number): void {
    const now = Date.now();
    
    if (this.lastDistanceUpdateTime && speed > 0) {
      const timeElapsedSeconds = (now - this.lastDistanceUpdateTime) / 1000;
      const speedMs = speed / 3.6; // km/h to m/s
      const distanceIncrement = speedMs * timeElapsedSeconds;
      
      // 妥当な範囲の増分のみ追加（0.1m～100m）
      if (distanceIncrement > 0.1 && distanceIncrement < 100) {
        this.calculatedDistance += distanceIncrement;
        console.log(`🧮 Distance increment: +${distanceIncrement.toFixed(2)}m (total: ${this.calculatedDistance.toFixed(1)}m)`);
      }
    }
    
    this.lastDistanceUpdateTime = now;
  }

  private handleControlPointResponse(data: Buffer): void {
    const responseCode = data[0];
    const requestOpCode = data[1];
    const resultCode = data[2];

    const resultMap: { [key: number]: string } = {
      0x01: 'SUCCESS',
      0x02: 'NOT_SUPPORTED',
      0x03: 'INVALID_PARAMETER',
      0x04: 'OPERATION_FAILED',
      0x05: 'CONTROL_NOT_PERMITTED'
    };

    const result = resultMap[resultCode] || `UNKNOWN(${resultCode})`;
    console.log(`🎛️ Control Point response: ${result}`);
  }

  async setResistanceLevel(level: number): Promise<OperationResult> {
    if (!this.controlPointCharacteristic) {
      return {
        success: false,
        error: 'Control Point characteristic not available'
      };
    }

    if (level < 1 || level > 80) {
      return {
        success: false,
        error: 'Resistance level must be between 1 and 80'
      };
    }

    try {
      console.log(`🔧 Setting resistance level: ${level}`);

      // First try to request control of the fitness machine
      await this.requestControl();

      // OpCode 0x04: Set Target Resistance Level
      const command = Buffer.from([
        0x04,                    // OpCode
        level & 0xFF,           // Low byte
        (level >> 8) & 0xFF     // High byte
      ]);

      console.log(`📡 Sending resistance command: ${command.toString('hex')}`);

      // Try writeWithoutResponse first (many fitness machines prefer this)
      await new Promise<void>((resolve, reject) => {
        this.controlPointCharacteristic.write(command, true, (error: any) => {
          if (error) {
            console.log('⚠️ Write without response failed, trying with response...');
            // Fallback to write with response
            this.controlPointCharacteristic.write(command, false, (error2: any) => {
              if (error2) reject(error2);
              else resolve();
            });
          } else {
            resolve();
          }
        });
      });

      console.log('✅ Resistance command sent');
      return {
        success: true
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Resistance setting error:', errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  private async requestControl(): Promise<void> {
    if (!this.controlPointCharacteristic) {
      return;
    }

    try {
      const requestControlCommand = Buffer.from([0x00]); // OpCode 0x00: Request Control
      console.log('🎛️ Requesting control of fitness machine...');
      
      await new Promise<void>((resolve, reject) => {
        this.controlPointCharacteristic.write(requestControlCommand, true, (error: any) => {
          if (error) reject(error);
          else resolve();
        });
      });
      
      // Wait for response
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.log('⚠️ Request control failed:', error);
      // Don't throw - resistance command might still work
    }
  }

  getCurrentMetrics(): BikeMetrics {
    return { ...this.currentMetrics };
  }

  getConnectionStatus(): ConnectionStatus {
    return {
      isConnected: this.isConnected,
      deviceName: this.device?.advertisement?.localName || null,
      deviceId: this.device?.id || null,
      isMonitoring: this.isMonitoring,
      lastDataReceived: this.currentMetrics.timestamp
    };
  }

  disconnect(): void {
    if (this.device && this.isConnected) {
      this.device.disconnect();
      console.log('❌ Disconnected from device');
    }
    this.isConnected = false;
    this.isMonitoring = false;
  }
}