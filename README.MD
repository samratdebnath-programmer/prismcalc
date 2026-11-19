# PrismCalc

A glassmorphic scientific calculator and function grapher that runs entirely in the browser. No build step, no dependencies.

**Live demo:** https://samratdebnath-programmer.github.io/prismcalc/

## Features

- Type or tap full expressions: `sin(30) + 2^3 * (4/2)`, `2pi`, `3(4+5)`, `200 + 10%`
- Safe expression parser (no `eval`) with correct operator precedence
- Trig, inverse trig, hyperbolic, `ln`, `log`, `√`, `abs`, `n!`, `nCr`, `nPr`, `gcd`, `lcm`, `mod`
- DEG / RAD / GRAD modes
- Variables (`a = 5`, then `a * 3`), `Ans`, constants `π`, `e`, `tau`, `phi`
- Memory keys (MC, MR, M−, M+)
- Live result preview while typing, plus HEX / DEC / OCT / BIN for whole numbers
- History saved in the browser; click an entry to reuse it
- Graph tab: plot several functions at once (`sin(x); x^2/10`), drag to pan, scroll to zoom
- Three glass themes: Aurora, Ember, Lagoon
- Keyboard: `Enter` to calculate, `Esc` to clear

## Run locally

Open `index.html` in a browser, or use the Live Server extension in VS Code.

## Publish on GitHub Pages

1. Create a new repository on GitHub named `prismcalc`.
2. In the VS Code terminal, inside the project folder:
   ```bash
   git init
   git add .
   git commit -m "PrismCalc: first release"
   git branch -M main
   git remote add origin https://github.com/samratdebnath-programmer/prismcalc.git
   git push -u origin main
   ```
3. On GitHub open **Settings → Pages**, set the source to the `main` branch and the `/ (root)` folder, then save.
4. After a minute the site is live at `https://samratdebnath-programmer.github.io/prismcalc/`.

## License

MIT
