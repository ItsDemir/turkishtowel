/* Product page: colour swatches, the image gallery, add to bag and the accordion. */
(function () {
  'use strict';

  var product = document.querySelector('[data-product]');
  if (!product) return;

  var cart = window.PamuqCart;
  var slug = product.getAttribute('data-slug');
  var name = product.getAttribute('data-name');
  var price = parseInt(product.getAttribute('data-price'), 10);

  var frame = product.querySelector('[data-gallery-frame]');
  var layers = Array.prototype.slice.call(frame.querySelectorAll('[data-gallery-layer]'));
  var thumbs = Array.prototype.slice.call(product.querySelectorAll('[data-thumb]'));
  var options = Array.prototype.slice.call(product.querySelectorAll('input[name="colour"]'));
  var colourName = product.querySelector('[data-colour-name]');
  var addButton = product.querySelector('[data-add]');

  var MAIN_WIDTHS = [700, 1000, 1400];
  var THUMB_WIDTHS = [160, 240, 360];
  var UNSPLASH = 'https://images.unsplash.com/';

  /* Unsplash serves any width on request. Other images are used as they are. */
  function sized(url, width) {
    if (url.indexOf(UNSPLASH) !== 0) return url;
    var resized = new URL(url);
    resized.searchParams.set('w', String(width));
    resized.searchParams.set('q', '80');
    resized.searchParams.set('auto', 'format');
    return resized.toString();
  }

  function srcset(url, widths) {
    if (url.indexOf(UNSPLASH) !== 0) return '';
    return widths
      .map(function (width) {
        return sized(url, width) + ' ' + width + 'w';
      })
      .join(', ');
  }

  function setSource(image, url, widths) {
    var set = srcset(url, widths);
    if (set) image.setAttribute('srcset', set);
    else image.removeAttribute('srcset');
    image.src = sized(url, widths[1]);
  }

  /* Gallery: two stacked pictures that cross fade */

  var activeLayer = 0;
  var swap = 0;
  var activeThumb = 0;

  function show(url, alt) {
    var current = layers[activeLayer];
    var next = layers[1 - activeLayer];
    var ticket = ++swap;

    next.classList.remove('is-broken');
    next.alt = alt;
    setSource(next, url, MAIN_WIDTHS);

    function reveal() {
      if (ticket !== swap) return;
      next.classList.add('is-active');
      current.classList.remove('is-active');
      activeLayer = 1 - activeLayer;
    }

    function failed() {
      next.classList.add('is-broken');
      reveal();
    }

    if (typeof next.decode === 'function') next.decode().then(reveal, failed);
    else if (next.complete && next.naturalWidth > 0) reveal();
    else {
      next.addEventListener('load', reveal, { once: true });
      next.addEventListener('error', failed, { once: true });
    }
  }

  function setTone(toneA, toneB) {
    frame.style.setProperty('--tone-a', toneA);
    frame.style.setProperty('--tone-b', toneB);
    if (thumbs[0]) {
      thumbs[0].style.setProperty('--tone-a', toneA);
      thumbs[0].style.setProperty('--tone-b', toneB);
    }
  }

  function selectThumb(index, force) {
    if (index === activeThumb && !force) return;
    activeThumb = index;
    thumbs.forEach(function (thumb, position) {
      var current = position === index;
      thumb.classList.toggle('is-active', current);
      if (current) thumb.setAttribute('aria-current', 'true');
      else thumb.removeAttribute('aria-current');
    });
    show(thumbs[index].getAttribute('data-src'), thumbs[index].getAttribute('data-alt'));
  }

  thumbs.forEach(function (thumb, index) {
    thumb.addEventListener('click', function () {
      selectThumb(index, false);
    });
  });

  /* Colour */

  function selectedOption() {
    return options.filter(function (option) {
      return option.checked;
    })[0];
  }

  function updateAddButton(option) {
    var soldOut = Number(option.getAttribute('data-stock')) < 1;
    addButton.disabled = soldOut;
    addButton.textContent = soldOut ? 'Sold out' : 'Add to bag';
  }

  function onColourChange() {
    var option = selectedOption();
    if (!option) return;

    var url = option.getAttribute('data-image');
    var alt = option.getAttribute('data-alt');
    colourName.textContent = option.getAttribute('data-colour');
    updateAddButton(option);
    setTone(option.getAttribute('data-tone-a'), option.getAttribute('data-tone-b'));

    /* The first thumbnail is always the picture of the chosen colour. */
    if (thumbs[0]) {
      var thumbImage = thumbs[0].querySelector('img');
      thumbs[0].setAttribute('data-src', url);
      thumbs[0].setAttribute('data-alt', alt);
      thumbImage.classList.remove('is-broken');
      thumbImage.alt = alt;
      setSource(thumbImage, url, THUMB_WIDTHS);
    }
    selectThumb(0, true);
  }

  options.forEach(function (option) {
    option.addEventListener('change', onColourChange);
  });

  /* Add to bag */

  addButton.addEventListener('click', function () {
    var option = selectedOption();
    if (!option || Number(option.getAttribute('data-stock')) < 1) return;

    cart.add({
      id: option.value,
      slug: slug,
      name: name,
      colour: option.getAttribute('data-colour'),
      price: price,
      quantity: 1,
      image: sized(option.getAttribute('data-image'), 200)
    });
    cart.open(addButton);
  });

  /* Accordion: one section open at a time */

  var accordion = product.querySelector('[data-accordion]');
  var sections = Array.prototype.slice.call(accordion.querySelectorAll('.accordion__item'));

  function setOpen(section, open) {
    section.classList.toggle('is-open', open);
    section.querySelector('[data-accordion-trigger]').setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  accordion.addEventListener('click', function (event) {
    var trigger = event.target.closest('[data-accordion-trigger]');
    if (!trigger) return;
    var section = trigger.closest('.accordion__item');
    var willOpen = !section.classList.contains('is-open');
    sections.forEach(function (other) {
      setOpen(other, other === section && willOpen);
    });
  });

  /* Footer links such as /product/hammam-classic#care open that section. */
  function openFromHash() {
    var target = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
    if (!target || sections.indexOf(target) === -1) return;
    sections.forEach(function (section) {
      setOpen(section, section === target);
    });
    target.scrollIntoView({ block: 'center' });
  }

  window.addEventListener('hashchange', openFromHash);
  openFromHash();
})();
