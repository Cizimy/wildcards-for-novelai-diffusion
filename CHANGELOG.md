# Changelog

## Version 3.0.0 - Enhanced Wildcard System

### 🎯 New Features

#### 1. Weighted Random Selection
- Support for weighted options in both `{option1:weight1|option2:weight2}` and `||option1:weight1|option2:weight2||` formats
- Higher weight numbers = higher probability of selection
- Backward compatible with existing equal-probability wildcards

#### 2. Hierarchical Wildcards
- Support for slash notation: `__scene/indoor__`, `__lighting/natural__`
- Automatic fallback to underscore/hyphen variants (`scene_indoor`, `scene-indoor`)
- Organized UI display with category grouping

#### 3. Conditional Logic System
- `@if{variable=value:true_option|false_option}` - Basic conditional logic
- `@scene{indoor:indoor_option|outdoor_option}` - Scene-aware selection
- Context detection based on existing keywords in prompt

#### 4. Exclusion Control
- `!tag` syntax to exclude conflicting terms
- Automatic cleanup of contradictory tags
- Prevents logical conflicts (e.g., indoor + rainy)

#### 5. Enhanced UI
- Hierarchical display of wildcards in popup
- Category grouping (scene/, lighting/, etc.)
- Improved organization and navigation

### 🔧 Technical Improvements
- Enhanced regex patterns for better wildcard detection
- Recursive processing with exclusion control
- Improved error handling and fallback mechanisms
- Optimized weight calculation algorithm

### 📁 Sample Wildcards Included
- Scene categories (indoor/outdoor)
- Lighting conditions (natural/artificial)
- Composition and framing options
- Weather conditions with outdoor-only logic
- Time of day variations
- Quality enhancement tags

### 🔄 Backward Compatibility
- All existing wildcard files continue to work
- Existing `{option1|option2}` and `||option1|option2||` syntax unchanged
- No breaking changes to core functionality

### 🎨 Usage Examples

**Basic weighted selection:**
```
{sunny:3|cloudy:2|rainy:1}
```

**Hierarchical wildcards:**
```
__scene/indoor__, __lighting/natural__, __composition__
```

**Conditional logic:**
```
@scene{outdoor:__weather__|}, __time_of_day__
```

**Exclusion control:**
```
{sunny !rainy|cloudy !sunny|rainy !sunny}
```

### 🚀 Getting Started
1. Load sample wildcards from `/sample-wildcards/` directory
2. Try the enhanced syntax in your NovelAI prompts  
3. See `/sample-wildcards/README.md` for detailed examples