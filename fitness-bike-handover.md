# フィットネスバイク Web Bluetooth 制御 - 引き継ぎ依頼書

## 📋 プロジェクト概要

zepan&nexgim AI フィットネスバイク MG03とMacをWeb Bluetooth APIで接続し、負荷調整機能を実装するプロジェクト。

## 🎯 現在の状況

### ✅ 完了済み
1. **Web版アプリ** - 3つのバージョンを作成済み
   - `/Users/kazuph/fitness-bike-webapp.html` (v1: 基本版)
   - `/Users/kazuph/fitness-bike-webapp-v2.html` (v2: パワーメーター付き)
   - `/Users/kazuph/fitness-bike-webapp-v3.html` (v3: デバッグ版) ⭐ **メイン**

2. **Python実装** - **完全動作** 🎉
   - `/Users/kazuph/fitness-bike-debug/python-implementation/fitness_bike_controller.py`
   - tmuxペイン `%13` で実行中
   - 負荷制御が100%成功している

### ❌ 解決が必要な問題

#### 1. Web版の負荷制御失敗
- **現象**: `GATT operation failed for unknown reason`
- **Python版では成功** → バイク自体は負荷制御対応済み
- **原因**: 制御権取得やコマンド順序の問題

#### 2. Web版のデータ表示問題 (一部修正済み)
- ✅ 速度: 短期移動平均で改善済み (3データポイント)
- ✅ 距離: 1km未満はm表記に修正済み
- ❌ パワー値: 異常値(800-1000W)が混入

## 🔧 技術詳細

### Python版の成功実装 (参考用)

```python
# 成功している制御手順
1. await controller.connect()           # デバイス接続
2. await controller.request_control()   # 制御権要求 (OpCode 0x00)
3. await controller.start_resume()      # 開始コマンド (OpCode 0x07)
4. await controller.set_resistance_level(level)  # 負荷設定

# 3つの制御方法を並行実行
- OpCode 0x04: Set Target Resistance Level ✅ SUCCESS
- OpCode 0x05: Set Target Power ✅ SUCCESS  
- OpCode 0x11: Indoor Bike Simulation ✅ SUCCESS
```

### Web版で実装すべき修正

#### 1. 制御権取得の実装
```javascript
async sendRequestControl() {
    const command = new Uint8Array(1);
    command[0] = 0x00; // Request Control
    await this.controlPoint.writeValue(command);
}

async sendStartResume() {
    const command = new Uint8Array(1);
    command[0] = 0x07; // Start or Resume
    await this.controlPoint.writeValue(command);
}
```

#### 2. 制御シーケンスの改善
```javascript
async connect() {
    // 既存の接続処理
    await this.setupControlPoint();
    
    // 新規追加: 制御権取得
    await this.sendRequestControl();
    await this.waitForResponse(1000);
    
    await this.sendStartResume();
    await this.waitForResponse(1000);
}
```

#### 3. パワー値フィルタリング強化
```javascript
parseIndoorBikeData(dataView) {
    // ... 既存のパース処理
    
    if (hasInstPower && offset + 2 <= dataView.byteLength) {
        const power = dataView.getInt16(offset, true);
        // 厳格なフィルタリング
        if (power >= 0 && power <= 500 && !isNaN(power)) {
            this.updatePowerGauge(power);
        }
        // 異常値はログに出力して無視
        debugInfo += `Power: ${power} W ${power > 500 ? '(異常値)' : ''}\n`;
    }
}
```

## 📁 ファイル構成

```
/Users/kazuph/
├── fitness-bike-webapp-v3.html          # メインのWeb版 (修正対象)
├── fitness-bike-webapp-v2.html          # パワーメーター版
├── fitness-bike-webapp.html             # 初期版
└── fitness-bike-debug/
    ├── python-implementation/
    │   └── fitness_bike_controller.py    # 動作する参考実装
    └── node-implementation/
        └── fitness-bike-controller.js    # Noble失敗版
```

## 🎯 次の担当者への依頼

### 優先度 HIGH
1. **Web版負荷制御の修正**
   - Python版の成功パターンをWeb版に移植
   - 制御権取得 → 開始コマンド → 負荷設定の順序実装
   - Control Point応答の適切な処理

2. **パワー値異常の修正**
   - より厳格なフィルタリング実装
   - データパースの検証強化

### 優先度 MEDIUM
3. **UX改善**
   - 制御権取得の進捗表示
   - エラー時の詳細説明
   - 負荷調整成功/失敗の明確な表示

## 🔍 検証環境

### Python版テスト (tmuxペイン %13)
```bash
# 現在実行中のPython実装でテスト可能
cd ~/fitness-bike-debug/python-implementation
python3 fitness_bike_controller.py

# テストコマンド
scan      # デバイススキャン
connect   # 接続
control   # 制御権要求
start     # 開始
r10       # 負荷レベル10設定
responses # 応答履歴確認
```

### Web版テスト
```bash
# v3デバッグ版を開く
open /Users/kazuph/fitness-bike-webapp-v3.html
```

## 📊 期待される結果

1. **Web版での負荷制御成功**
   - Python版と同様のSUCCESS応答
   - 抵抗レベルの実際の変更確認

2. **安定したデータ表示**
   - パワー値の異常値除去
   - スムーズな速度表示継続

3. **ユーザビリティ向上**
   - 制御の成功/失敗が明確
   - エラー時の具体的な対処法表示

## 🚀 最終目標

MG03フィットネスバイクとWebブラウザでの完全な双方向通信を実現し、Zwiftのような商用アプリと同等の負荷制御機能を提供する。

---

**作成日**: 2025-06-27  
**Python版動作確認**: ✅ 完了 (tmuxペイン %13)  
**Web版修正**: ❌ 要対応  
**引き継ぎ対象**: `/Users/kazuph/fitness-bike-webapp-v3.html`