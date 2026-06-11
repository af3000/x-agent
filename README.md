# Mini Shop

A simple static shopping website — no build step, no dependencies.

## Features
- **3 products** displayed in a responsive grid
- **Shopping cart** drawer with quantity controls and live totals
- **Checkout** modal with an order summary
- **Payment form** with client-side validation (card/expiry/CVC formatting) and an order confirmation

> This is a demo store. No real payment is processed.

## Run it
Just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Files
- `index.html` — markup and modal/drawer structure
- `styles.css` — styling
- `app.js` — products, cart state, checkout and payment logic
