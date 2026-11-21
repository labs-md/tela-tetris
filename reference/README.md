# Reference: the paper's algorithm in Python

`ncc_packing.py` is a straight implementation of Meng, L. et al., "Optimizing 2D irregular
packing via image processing and computational intelligence", *Scientific Reports* 15:12320
(2025), doi:10.1038/s41598-025-97202-0. Comments in the code point to the paper's equation numbers.

`demo.py` packs synthetic parts and saves `layout.png`. It needs `numpy`, `scipy` and `pillow`:

    python demo.py layout.png

The engine (`../arrange/arrange.js`) ports this method to JavaScript, and adds an order
search, per-item hole filling and blocked regions.

Full citation and BibTeX: [root README](../README.md#citation).
