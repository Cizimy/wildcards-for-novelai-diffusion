# Enhanced Wildcard Samples

This directory contains sample wildcard files demonstrating the new features of the enhanced NovelAI Diffusion wildcards extension.

## New Features Demonstrated

### 1. Weighted Selection
Use `option:weight` format for weighted random selection:
```
sunny:3
cloudy:2  
rainy:1
```
Higher numbers = more likely to be selected.

### 2. Hierarchical Wildcards
Files named with underscores or hyphens create hierarchies:
- `scene_indoor.txt` → accessed as `__scene/indoor__`  
- `lighting_natural.txt` → accessed as `__lighting/natural__`

### 3. Conditional Logic
Use `@scene{indoor:indoor_option|outdoor_option}` for context-aware selection:
```
@scene{outdoor:sunny:2|cloudy:1|rainy:0.5|}
```

### 4. Exclusion Control
Use `!tag` to exclude conflicting tags:
```
sunny !rainy !snowing
```

## Usage Examples

### Basic hierarchical usage:
```
__scene/indoor__, __lighting/natural__, __composition__, __quality__
```

### With conditional weather:
```
__scene/outdoor__, __weather__, __time_of_day__, __quality__
```

### Complex composition:
```
{__scene/indoor__:3|__scene/outdoor__:2}, @scene{indoor:__lighting/artificial__|__lighting/natural__}, __composition__, __quality__
```

## File Structure
- `scene_*.txt` - Location wildcards (indoor/outdoor)
- `lighting_*.txt` - Lighting condition wildcards
- `composition.txt` - Camera angles and framing
- `weather.txt` - Weather conditions (outdoor only)  
- `time_of_day.txt` - Time-based lighting
- `quality.txt` - Quality enhancement tags