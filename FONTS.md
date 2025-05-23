# Custom Fonts Setup

This project now includes custom Cera and CeraPRO fonts. Here's how to use them:

## Available Fonts

### Cera Font Family

- **Light** (300): `Cera-Light.ttf`
- **Regular** (400): `Cera-Regular.ttf`
- **Bold** (700): `Cera-Bold.ttf`

### CeraPRO Font Family

- **Light** (300): `CeraPRO-Light.ttf`
- **Regular** (400): `CeraPRO-Regular.ttf`
- **Medium** (500): `CeraPRO-Medium.ttf`
- **Bold** (700): `CeraPRO-Bold.ttf`
- **Black** (900): `CeraPRO-Black.ttf`

## Tailwind CSS Classes

You can use these fonts in your components with the following Tailwind classes:

### Font Families

```html
<!-- Use Cera font -->
<h1 className="font-cera">Heading with Cera</h1>

<!-- Use CeraPRO font -->
<h1 className="font-cera-pro">Heading with CeraPRO</h1>

<!-- Default sans (CeraPRO is now the default) -->
<p className="font-sans">Body text with default font</p>
```

### Font Weights

```html
<!-- Light (300) -->
<p className="font-light">Light text</p>

<!-- Regular (400) -->
<p className="font-normal">Normal text</p>

<!-- Medium (500) - only available for CeraPRO -->
<p className="font-medium font-cera-pro">Medium text</p>

<!-- Bold (700) -->
<p className="font-bold">Bold text</p>

<!-- Black (900) - only available for CeraPRO -->
<p className="font-black font-cera-pro">Black text</p>
```

## Example Usage

```tsx
import React from "react";

const ExampleComponent = () => {
  return (
    <div className="p-8">
      {/* CeraPRO examples */}
      <h1 className="font-cera-pro font-black text-4xl mb-4">
        CeraPRO Black Heading
      </h1>

      <h2 className="font-cera-pro font-bold text-2xl mb-4">
        CeraPRO Bold Subheading
      </h2>

      <p className="font-cera-pro font-medium text-lg mb-4">
        This is medium weight text using CeraPRO
      </p>

      <p className="font-cera-pro font-normal text-base mb-4">
        This is regular weight text using CeraPRO
      </p>

      <p className="font-cera-pro font-light text-sm mb-8">
        This is light weight text using CeraPRO
      </p>

      {/* Cera examples */}
      <h2 className="font-cera font-bold text-2xl mb-4">Cera Bold Heading</h2>

      <p className="font-cera font-normal text-base mb-4">
        This is regular weight text using Cera
      </p>

      <p className="font-cera font-light text-sm">
        This is light weight text using Cera
      </p>
    </div>
  );
};

export default ExampleComponent;
```

## Default Font

The project is now configured to use **CeraPRO** as the default sans-serif font. This means any element without a specific font class will use CeraPRO automatically.

## Font Loading

The fonts are configured with `font-display: swap` for optimal loading performance. This means text will be visible immediately with a fallback font, then swap to the custom font once loaded.
