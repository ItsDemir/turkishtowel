# Product photos

Real product photos go in this folder, one folder per product and one folder per color inside it. They replace the stock photos automatically, color by color, with no code change. Read `docs/image-style-guide.md` before a shoot.

## Folders

```
public/products/
  ege-bath-towel/
    salt/
      01-folded.jpg
      02-hanging.jpg
      03-texture-close-up.jpg
      04-in-use.jpg
      05-scale.jpg
    aegean/
      01-folded.jpg
      ...
    default/          optional, used for any color without its own folder
      01-folded.jpg
```

* The product folder is the product's address: `/product/ege-bath-towel` uses `ege-bath-towel/`.
* The color folder is the color name in lower case with dashes: `salt`, `raw-cotton`, `sandstone`, `pamukkale`, `olive-grove`, `aegean`, `terracotta`, `basalt`, `salt-aegean-stripe`, `sand-basalt-stripe`.
* Files are shown in name order, so start each with a two digit number. The first photo is the one on the shop grid and in the cart.
* The words after the number become the alt text, so `03-texture-close-up.jpg` is described as "Ege Bath Towel in Salt, texture close up".
* JPEG, PNG, WebP and AVIF all work. Export JPEG in sRGB at about 2000 × 2500 px (4:5 portrait).

After adding or renaming photos, run:

```bash
npm run photos
```

This writes `manifest.json`, which the site uses on Vercel. Commit the photos and the manifest together. Running locally, the server reads the folders directly when it starts.

## Shot list

For every product and every color:

| File | Shot | What it shows |
| --- | --- | --- |
| `01-folded.jpg` | Folded on stone or pale wood, three quarter view | The color and the hem. This is the lead photo. |
| `02-hanging.jpg` | Hanging from a slim rail or hook | Drape and length. |
| `03-texture-close-up.jpg` | Macro of the loops, ribs or waffle | The weave and the weight. |
| `04-in-use.jpg` | In a bathroom, beside a bath or basin, or at the beach for the peshtemal | Scale in a real room. |
| `05-scale.jpg` | Held in two hands or laid flat next to a familiar object | How big it really is. |

For every set, once per color:

| File | Shot |
| --- | --- |
| `01-folded.jpg` | Every piece folded and stacked together |
| `02-laid-out.jpg` | The pieces laid out flat from above, so the count is clear |
| `03-gift-bag.jpg` | The set in its cotton gift bag |

For the site (paths go in `SITE_IMAGES` in `catalog.js`, files in `public/images/`):

* The homepage hero: a Bodrum coastline or terrace at morning light, 16:9, with calm space for the headline.
* The founder portrait for the About page.
* Two or three photos of the workshop in Denizli: the looms, hands at work, finished towels.
* A beach or pool scene with the peshtemal.

## Priority

If time or budget is short, shoot in this order:

1. `01-folded.jpg` for every color of the bath towel, hand towel and peshtemal.
2. `01-folded.jpg` for every other product in its most popular color (Salt), placed in `default/`.
3. Texture close ups for each of the four weaves.
4. The homepage hero and the workshop.
5. Everything else.
