# Pamuq image style guide

Every photo on the site should feel like the same quiet morning on the Aegean coast: soft daylight, natural materials, nothing loud. This guide is for whoever shoots or chooses the photography. The shot list and the file naming are in `public/products/README.md`.

## The feeling

* Calm, warm and unhurried. A towel that has just been folded, not a showroom.
* Bodrum is the mood: whitewashed walls, travertine, sun on stone, olive wood, linen, the blue of the bay. The towels themselves are woven in Denizli, so never caption or stage a Bodrum photo as the place they are made.
* The towel is always the subject. Props support it and never compete with it.

## Light

* Natural daylight from one side, ideally a window or open shade. Morning or late afternoon.
* Soft shadows are welcome, because they show the depth of the loops. Avoid hard midday sun on product shots.
* No flash, no colored gels, no heavy filters.

## Color

* White balance must be neutral to slightly warm. A towel's color on screen has to match the towel in the box, because the wrong color is the most common reason for a return.
* Shoot a gray card in the first frame of each setup and correct to it.
* Backgrounds: undyed cotton, warm white plaster, pale travertine, light oak or olive wood. No pure white seamless backdrops for lifestyle shots.

## Props

* Natural only: stone, wood, ceramic, linen, glass, olive branches, a bar of plain soap, a wooden brush.
* No branded products, no plastic, no text, no other people's logos.
* One or two props per frame at most.

## Composition

* Leave space around the towel. Crops can be tight on detail shots, but not cramped.
* Keep the horizon and the edges of tables level.
* People, when used, are shown from the shoulders down or from behind, so the photo is about the towel.

## Technical

| Use | Ratio | Minimum size | Notes |
| --- | --- | --- | --- |
| Product photos | 4:5 portrait | 2000 × 2500 px | The shop grid and product page crop to 4:5. Keep the towel inside the middle 80%. |
| Homepage hero | 16:9 landscape | 2400 × 1350 px | Also cropped to portrait on phones, so keep the subject near the center. Leave calm space on the left for the headline. |
| Editorial and story | 4:5 or 3:2 | 2000 px on the long side | |
| Social share (Open Graph) | 1.91:1 | 1200 × 630 px | Generated from the first product photo, so no separate file is needed. |

* Export as JPEG, sRGB, quality 85. On Vercel every photo is resized and converted to AVIF or WebP automatically, so export one large file and let the site do the rest.
* Keep each file under 2 MB.
* Strip location metadata before uploading.

## Alt text

* Alt text is generated from the product, the color and the file name. Name files so the generated text reads well, for example `03-texture-close-up.jpg` becomes "Ege Bath Towel in Salt, texture close up".
* Describe what is in the photo, not the marketing message.

## What to avoid

* Any image that implies a place of manufacture other than Turkey.
* Stock photos of other brands' towels presented as ours. The stock photos currently on the site are placeholders until real product photography exists.
* Fake reviews, fake press logos or fake badges in any image.
