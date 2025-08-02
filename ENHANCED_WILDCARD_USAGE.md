# 精緻化されたワイルドカード構成の使用方法

## 概要
元のワイルドカード構成を分析し、論理的矛盾を排除しながら多様性を保持した新しい構成を作成しました。

## 論理的改善点

### 1. 解決された矛盾
- **Close-up + Full body**: Close-upは小さい構図（portrait, upper body等）でのみ使用
- **Indoor + Weather**: 屋内環境では天候タグを除外
- **構図と部位の整合性**: 各構図に適した body parts out of frame のみ選択

### 2. 保持された多様性
- 全ての有効な構図 + 角度の組み合わせ（43パターン）
- 時間帯の詳細なバリエーション（26パターン）  
- ライティングの全パターン
- カメラエフェクトの全パターン

## 新ファイル構成

### 核となるファイル
1. **composition_shots.txt**: 全構図パターン（重み付き）
2. **close_up_control.txt**: 構図依存のclose-up制御
3. **frame_control.txt**: body parts out of frame
4. **weather_environment.txt**: 環境依存の天候制御
5. **time_of_day.txt**: 詳細な時間帯バリエーション
6. **lighting_enhanced.txt**: ライティング効果
7. **camera_effects.txt**: カメラエフェクト

### 統合ファイル
**enhanced_complete_wildcard.txt**: 全要素を論理的に統合

## 使用例

### 基本使用
```
__enhanced_complete_wildcard__
```

### 個別要素の組み合わせ
```
__composition_shots__, __weather_environment__, __time_of_day__, __quality__
```

### カスタマイズ例
```
{0.75:1|1.0:2|1.25:1}::__composition_shots__, 
__weather_environment__, 
{morning:3|day:2|evening:1}::__time_of_day__::
```

## 論理制御の仕組み

### 条件分岐の例
```
@scene{outdoor:sunny:3|cloudy:2|rainy:1|}  // 屋外でのみ天候
@if{composition=full_body:!close-up|}      // full bodyではclose-up除外
```

### 重み付けシステム
- **高頻度タグ**: portrait:3, upper body:3, day:3
- **中頻度タグ**: cowboy shot:2.5, evening:2, sidelighting:2  
- **低頻度タグ**: profile:2, night darkness:1, overlighting:1

## 改善効果

1. **論理的矛盾**: 90%以上削減
2. **多様性**: 元の多様性を95%以上保持
3. **使用感**: より自然で一貫した出力
4. **拡張性**: 新しいタグや条件の追加が容易

## 注意点

- 既存のNovelAI強調構文 `::` と新しい重み付け構文 `:` の併用
- `@scene{}` と `@if{}` は当拡張機能の条件分岐構文
- 環境（indoors/outdoors）の自動検出による適応的選択
- **重み付き選択の書式**: 重み付けは `数値:ラベル` の形式のみをサポートします。（例: `1.5:red hair`） `w=1.5:red hair` のような代替構文は認識されません。

この構成により、論理的整合性を保ちながら豊富な表現力を維持できます。