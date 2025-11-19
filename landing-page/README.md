# Retention Landing Page

A beautiful, paper-themed landing page for the Retention flashcard application.

## Features

- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices
- **Paper-Themed Styling**: Matches the main application's aesthetic with cream backgrounds, saddle brown accents, and hand-drawn elements
- **Platform Downloads**: Download buttons for macOS, Windows, and Linux
- **Feature Showcase**: Highlights key features of the Retention application
- **Smooth Animations**: Hand-drawn button effects and smooth scroll behavior
- **Zero Dependencies**: Standalone HTML file using Tailwind CSS via CDN

## Quick Start

### Local Development

Simply open the `index.html` file in your web browser:

```bash
# Navigate to the landing page directory
cd landing-page

# Open in your default browser (macOS)
open index.html

# Open in your default browser (Linux)
xdg-open index.html

# Open in your default browser (Windows)
start index.html
```

### Local Server

For a better development experience, serve the page using a local server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js (http-server)
npx http-server

# Using PHP
php -S localhost:8000
```

Then visit `http://localhost:8000` in your browser.

## Deployment

This landing page can be deployed to any static hosting service:

### GitHub Pages

1. Create a new repository or use an existing one
2. Push the `landing-page` directory contents to the `gh-pages` branch
3. Enable GitHub Pages in repository settings

### Netlify

1. Sign in to Netlify
2. Drag and drop the `landing-page` folder to deploy
3. Your site will be live instantly

### Vercel

1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` in the `landing-page` directory
3. Follow the prompts to deploy

### Other Platforms

The landing page is a simple static HTML file and can be hosted on:
- AWS S3 + CloudFront
- Google Cloud Storage
- Azure Static Web Apps
- Cloudflare Pages
- Any web server (Apache, Nginx, etc.)

## Customization

### Update Download Links

Currently, the download buttons are styled but not linked to actual files. To add download functionality:

1. Host your application binaries (e.g., on GitHub Releases)
2. Update the download button links in `index.html`:

```html
<!-- Example for macOS -->
<a href="https://github.com/yourusername/retention/releases/download/v1.0.0/retention-macos.dmg"
   class="download-btn p-6 rounded-2xl text-center group cursor-pointer">
    <!-- button content -->
</a>
```

### Modify Colors

The landing page uses the same color scheme as the main application:

- **Primary**: `#8B4513` (Saddle Brown)
- **Background**: `#FFF8E7` (Cream/Cornsilk)
- **Cards**: `#FFFEF9` (Off-white with warm tint)
- **Text**: `#654321` (Dark brown)

To customize, search and replace these hex values in the `index.html` file.

### Add Screenshots

To add application screenshots:

1. Take screenshots of your application
2. Save them in the `landing-page` directory (e.g., `screenshot-1.png`)
3. Add an image section in the HTML:

```html
<section class="container mx-auto px-6 py-20">
    <div class="max-w-5xl mx-auto">
        <img src="screenshot-1.png" alt="Retention Screenshot" class="flashcard p-4 rounded-3xl">
    </div>
</section>
```

### Update Links

Update placeholder links in the footer and navigation:

- GitHub repository link
- Documentation link
- Support/contact links
- Privacy policy and terms of service

## Design System

The landing page replicates the Retention application's design system:

- **Typography**: Inter (sans-serif) for body text, Gochi Hand for headings
- **Components**: Hand-drawn buttons, flashcards, feature cards
- **Effects**: Paper texture, shadow layering, 3D push button effects
- **Layout**: Responsive grid system using Tailwind CSS

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Opera 76+

## License

This landing page is part of the Retention project.
