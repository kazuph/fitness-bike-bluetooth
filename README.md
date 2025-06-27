# Fitness Bike Bluetooth Controller

🚴‍♂️ フィットネスバイク（MG03）とのBluetooth通信による負荷制御・データ取得システム

## 📋 プロジェクト概要

zepan&nexgim AI フィットネスバイク MG03とのWeb Bluetooth APIおよびネイティブBluetooth通信を実現する包括的なソリューションです。リアルタイムデータ取得と負荷制御機能を提供します。

## 🎯 実装バリエーション

### 1. Web版実装（HTML + JavaScript）

ブラウザのWeb Bluetooth APIを使用した軽量実装：

#### `fitness-bike-webapp.html` - 基本版
- 基本的な接続とデータ表示
- シンプルなUI設計

#### `fitness-bike-webapp-v2.html` - パワーメーター版
- パワーメーター機能追加
- 詳細なメトリクス表示

#### `fitness-bike-webapp-v3.html` - デバッグ版（推奨）
- 詳細なデバッグ情報表示
- エラーハンドリング強化
- パワー値フィルタリング
- 短期移動平均による速度安定化

#### `fitness-bike-webapp-v4.html` & `fitness-bike-webapp-v5.html`
- 追加の実験的機能と改良版

**特徴:**
- ✅ リアルタイムデータ表示（速度、ケイデンス、パワー、距離）
- ⚠️ 負荷制御は部分的（`GATT operation failed` エラー）
- 🌐 ブラウザ上で動作
- 📱 モバイル対応

### 2. Python実装（完全動作版）

#### `python-implementation/fitness_bike_controller.py`

**✅ 完全動作確認済み** - 最も信頼性の高い実装

```python
# 基本的な使用方法
python3 fitness_bike_controller.py

# コマンド例
scan      # デバイススキャン
connect   # 接続
control   # 制御権要求
start     # 開始コマンド
r10       # 負荷レベル10設定
responses # 応答履歴確認
```

**特徴:**
- ✅ 完全な負荷制御機能（1-80レベル）
- ✅ 3つの制御方法をサポート
  - OpCode 0x04: Set Target Resistance Level
  - OpCode 0x05: Set Target Power
  - OpCode 0x11: Indoor Bike Simulation
- ✅ 詳細なデバッグ機能
- ✅ 制御権取得からデータ監視まで完全対応
- 📊 包括的なメトリクス取得

**依存関係:**
```bash
pip3 install bleak asyncio
```

### 3. Node.js/TypeScript実装（モダン版）

#### `node-implementation/`

最新のTypeScript/React技術スタックを使用したモダンな実装：

**主要ファイル:**
- `aerobike-controller.ts` - コアBluetoothコントローラー
- `mcp-server.ts` - Model Context Protocol対応サーバー
- `tui-app.tsx` - React Terminal UIアプリケーション
- `fitness-bike-controller.js` - レガシー実装

**特徴:**
- 🖥️ React TUI（ターミナルUI）
- 🔌 MCP Server機能
- 📊 リアルタイムメトリクス表示
- 🎛️ 負荷制御機能（1-80レベル）

**使用方法:**
```bash
cd node-implementation
npm install

# TUIアプリケーション
npm run tui

# MCPサーバー
npm run dev
```

**操作方法:**
- `s` - デバイススキャン開始
- `c` - 接続
- `r1-80` - 抵抗レベル設定 (例: r20)
- `q` - 終了

**技術スタック:**
- TypeScript/Node.js (ES Modules)
- @abandonware/noble (Bluetooth LE)
- React + ink (TUI)
- @modelcontextprotocol/sdk (MCP)

## 🔧 技術仕様

### Bluetooth仕様
- **Service UUID**: 0x1826 (Fitness Machine Service)
- **Data Characteristic**: 0x2ad2 (Indoor Bike Data)
- **Control Characteristic**: 0x2ad9 (Fitness Machine Control Point)

### 取得可能メトリクス
- 瞬間速度・平均速度 (km/h)
- 瞬間ケイデンス・平均ケイデンス (rpm)
- 瞬間パワー・平均パワー (W)
- 総距離 (m)
- 抵抗レベル (1-80)

### 負荷制御
- レベル1-80の抵抗調整
- 複数の制御方法をサポート
- リアルタイム調整可能

## 🚀 使用開始方法

### 推奨順序

1. **Python版で動作確認**（最も安定）
   ```bash
   cd python-implementation
   python3 fitness_bike_controller.py
   ```

2. **Web版でブラウザ体験**
   ```bash
   open fitness-bike-webapp-v3.html
   ```

3. **Node.js版でモダン開発**
   ```bash
   cd node-implementation
   npm install && npm run tui
   ```

## 📊 現在の状況

### ✅ 動作確認済み
- **Python実装**: 100%動作、負荷制御完全対応
- **Web版**: データ表示は安定、負荷制御は部分的
- **Node.js実装**: 基本機能動作確認済み

### ⚠️ 既知の問題
- **Web版負荷制御**: `GATT operation failed` エラー
- **Web版パワー値**: 異常値（800-1000W）の混入

### 🔧 修正が必要な箇所
1. Web版での制御権取得手順の実装
2. Web版パワー値フィルタリングの強化
3. エラーハンドリングの改善

## 🎯 対応デバイス

- **主要対象**: MG03 Aerobike (zepan&nexgim)
- **互換性**: Fitness Machine Service (0x1826) 対応デバイス

## 📄 ライセンス

MIT License

## 📝 開発者向け情報

### デバッグ
- Python版の成功パターンを参考にWeb版の修正が可能
- 詳細なログ出力により問題特定が容易
- 各実装で異なるアプローチを比較検討可能

### 貢献
本プロジェクトは実験的な試行錯誤の結果物です。各実装方式の比較研究や、Bluetooth LE通信の学習目的に活用してください。

---

**作成日**: 2025-06-27  
**最終更新**: 2025-06-27  
**Python版動作確認**: ✅ 完了  
**Web版改善**: 🔄 継続中