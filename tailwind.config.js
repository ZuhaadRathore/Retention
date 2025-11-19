/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paper-like brown and white color scheme
        "primary": "#8B4513",              // Saddle brown for primary actions
        "primary-dark": "#654321",         // Darker brown for hover states
        "background-light": "#FFF8E7",     // Cream/cornsilk - like old paper
        "card-background": "#FFFEF9",      // Almost white with warm tint - like flashcard paper
        "card-shadow": "#D4A574",          // Light brown shadow for depth
        "text-color": "#3E2723",           // Dark chocolate brown text
        "text-muted": "#6D4C41",           // Medium brown for secondary text
        "border-color": "#8D6E63",         // Warm brown borders
        "hint-blue": "#5D4E37",            // Umber brown (replacing blue)
        "correct-green": "#6B8E23",        // Olive green - natural/earthy
        "incorrect-red": "#A0522D",        // Sienna brown-red
        "warning-amber": "#CD853F",        // Peru amber for warnings
        "accent-tan": "#D2B48C",           // Tan accent color
        "paper-line": "#E8D4B8",           // Light brown like ruled lines on paper
      },
      fontFamily: {
        "sans": ["Inter", "system-ui", "sans-serif"],
        "display": ["Gochi Hand", "cursive"],
        "handwriting": ["Gochi Hand", "cursive"],
      },
      boxShadow: {
        'paper': '4px 4px 0px 0px rgba(139, 69, 19, 0.2), 8px 8px 0px 0px rgba(139, 69, 19, 0.1)',
        'paper-lg': '6px 6px 0px 0px rgba(139, 69, 19, 0.25), 12px 12px 0px 0px rgba(139, 69, 19, 0.15)',
        'card': '3px 3px 8px rgba(62, 39, 35, 0.15)',
      },
    },
  },
  plugins: [],
}
