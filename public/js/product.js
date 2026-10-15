/* Product page: the gallery (thumbnails, swipe, arrow keys and zoom), colors, quantity,
   add to cart, the sticky bar on phones, recently viewed and the review form. */
(function () {
  'use strict';

  var product = document.querySelector('[data-product]');
  if (!product) return;

  var cart = window.PamuqCart;
  var track = window.PamuqTrack || function () {};
  var slug = product.getAttribute('data-slug');
  var name = product.getAttribute('data-name');
  var price = parseInt(product.getAttribute('data-price'), 10);

  var gallery = product.querySelector('[data-gallery]');
  var frame = gallery.querySelector('[data-gallery-frame]');
  var mainImage = gallery.querySelector('[data-gallery-image]');
  var thumbList = gallery.querySelector('[data-thumbs]');
  var counter = gallery.querySelector('[data-gallery-count]');
  var options = Array.prototype.slice.call(product.querySelectorAll('input[name="color"]'));
  var colorName = product.querySelector('[data-color-name]');
  var addButton = product.querySelector('[data-add]');
  var addLabel = addButton.getAttribute('data-add-label') || 'Add to cart';
  var quantityInput = product.querySelector('[data-qty-input]');

  var images = [];
  var index = 0;

  function selectedOption() {
    return options.filter(function (option) {
      return option.checked;
    })[0];
  }

  function imagesOf(option) {
    try {
      return JSON.parse(option.getAttribute('data-images')) || [];
    } catch (error) {
      return [];
    }
  }

  /* Gallery */

  function show(next) {
    if (images.length === 0) return;
    index = (next + images.length) % images.length;
    var image = images[index];
    mainImage.classList.remove('is-broken');
    mainImage.removeAttribute('data-fallback');
    mainImage.srcset = image.srcset;
    mainImage.src = image.src;
    mainImage.alt = image.alt;
    thumbList.querySelectorAll('[data-thumb]').forEach(function (thumb, position) {
      var current = position === index;
      thumb.classList.toggle('is-active', current);
      if (current) thumb.setAttribute('aria-current', 'true');
      else thumb.removeAttribute('aria-current');
    });
    counter.textContent = images.length > 1 ? index + 1 + ' / ' + images.length : '';
  }

  function buildThumbs() {
    thumbList.textContent = '';
    images.forEach(function (image, position) {
      var item = document.createElement('li');
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'thumb media media--portrait';
      button.setAttribute('data-thumb', String(position));
      button.setAttribute('aria-label', 'Show picture ' + (position + 1) + ' of ' + images.length);
      var img = document.createElement('img');
      img.src = image.thumb;
      img.alt = image.alt;
      img.loading = 'lazy';
      img.decoding = 'async';
      button.appendChild(img);
      item.appendChild(button);
      thumbList.appendChild(item);
    });
  }

  function useImages(next) {
    var same = next.length === images.length && next.every(function (image, position) {
      return images[position] && images[position].src === image.src;
    });
    images = next;
    if (!same) {
      buildThumbs();
      show(0);
    }
  }

  thumbList.addEventListener('click', function (event) {
    var thumb = event.target.closest('[data-thumb]');
    if (thumb) show(parseInt(thumb.getAttribute('data-thumb'), 10));
  });

  gallery.querySelector('[data-gallery-prev]').addEventListener('click', function () {
    show(index - 1);
  });
  gallery.querySelector('[data-gallery-next]').addEventListener('click', function () {
    show(index + 1);
  });

  gallery.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      show(index - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      show(index + 1);
    }
  });

  /* Swipe on touch screens. A swipe does not also open the zoom. */
  var startX = null;
  var startY = null;
  var swiped = false;
  frame.addEventListener('pointerdown', function (event) {
    startX = event.clientX;
    startY = event.clientY;
    swiped = false;
  });
  frame.addEventListener('pointerup', function (event) {
    if (startX === null) return;
    var dx = event.clientX - startX;
    var dy = event.clientY - startY;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      swiped = true;
      show(dx < 0 ? index + 1 : index - 1);
    }
    startX = null;
  });

  /* Zoom: a full screen view. Tap or click zooms in where you point; on phones the
     picture can also be pinched. */
  var lightbox = document.querySelector('[data-lightbox]');
  var stage = lightbox.querySelector('[data-lightbox-stage]');
  var large = lightbox.querySelector('[data-lightbox-image]');

  function showLarge() {
    var image = images[index];
    stage.classList.remove('is-zoomed');
    large.src = image.large;
    large.alt = image.alt;
  }

  frame.addEventListener('click', function () {
    if (swiped) {
      swiped = false;
      return;
    }
    if (typeof lightbox.showModal !== 'function') return;
    showLarge();
    lightbox.showModal();
    document.documentElement.classList.add('dialog-open');
  });

  lightbox.addEventListener('close', function () {
    document.documentElement.classList.remove('dialog-open');
    frame.focus();
  });
  lightbox.querySelector('[data-lightbox-close]').addEventListener('click', function () {
    lightbox.close();
  });
  lightbox.querySelector('[data-lightbox-prev]').addEventListener('click', function () {
    show(index - 1);
    showLarge();
  });
  lightbox.querySelector('[data-lightbox-next]').addEventListener('click', function () {
    show(index + 1);
    showLarge();
  });
  lightbox.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowLeft') {
      show(index - 1);
      showLarge();
    } else if (event.key === 'ArrowRight') {
      show(index + 1);
      showLarge();
    }
  });
  large.addEventListener('click', function (event) {
    var rect = large.getBoundingClientRect();
    large.style.transformOrigin = ((event.clientX - rect.left) / rect.width) * 100 + '% ' + ((event.clientY - rect.top) / rect.height) * 100 + '%';
    stage.classList.toggle('is-zoomed');
  });

  /* Colors */

  function updateAddButton(option) {
    var soldOut = Number(option.getAttribute('data-stock')) < 1;
    addButton.disabled = soldOut;
    addButton.textContent = soldOut ? 'Sold out' : addLabel;
    if (stickyAdd) stickyAdd.disabled = soldOut;
  }

  function onColorChange(fromUser) {
    var option = selectedOption();
    if (!option) return;
    colorName.textContent = option.getAttribute('data-color');
    frame.style.setProperty('--tone', option.getAttribute('data-swatch'));
    updateAddButton(option);
    useImages(imagesOf(option));

    if (stickySwatch) stickySwatch.setAttribute('style', option.nextElementSibling.getAttribute('style'));
    if (stickyColor) stickyColor.textContent = option.getAttribute('data-color');

    if (fromUser) {
      /* The address carries the color, so it can be shared or bookmarked. */
      try {
        var url = new URL(window.location.href);
        url.searchParams.set('color', option.getAttribute('data-key'));
        window.history.replaceState(null, '', url);
      } catch (error) {}
      track('select_item', { item_id: option.value, item_name: name, item_variant: option.getAttribute('data-color') });
    }
  }

  options.forEach(function (option) {
    option.addEventListener('change', function () {
      onColorChange(true);
    });
  });

  /* Quantity */

  function quantity() {
    var value = parseInt(quantityInput.value, 10);
    return Math.max(1, Math.min(isNaN(value) ? 1 : value, 10));
  }

  product.querySelectorAll('[data-qty]').forEach(function (button) {
    button.addEventListener('click', function () {
      quantityInput.value = String(Math.max(1, Math.min(quantity() + parseInt(button.getAttribute('data-qty'), 10), 10)));
    });
  });
  quantityInput.addEventListener('change', function () {
    quantityInput.value = String(quantity());
  });

  /* Add to cart */

  function addToCart(trigger) {
    var option = selectedOption();
    if (!option || Number(option.getAttribute('data-stock')) < 1) return;
    cart.add({
      id: option.value,
      slug: slug,
      name: name,
      color: option.getAttribute('data-color'),
      price: price,
      quantity: quantity(),
      image: option.getAttribute('data-cart-image')
    });
    cart.open(trigger);
  }

  addButton.addEventListener('click', function () {
    addToCart(addButton);
  });

  /* The sticky bar on phones appears once the main button has scrolled out of view. */
  var sticky = document.querySelector('[data-sticky-buy]');
  var stickyAdd = sticky && sticky.querySelector('[data-sticky-add]');
  var stickySwatch = sticky && sticky.querySelector('[data-sticky-swatch]');
  var stickyColor = sticky && sticky.querySelector('[data-sticky-color]');
  if (sticky) {
    stickyAdd.addEventListener('click', function () {
      addToCart(stickyAdd);
    });
    var stickyFrame = 0;
    var placeSticky = function () {
      stickyFrame = 0;
      var past = addButton.getBoundingClientRect().bottom < 0;
      if (sticky.classList.contains('is-visible') === past) return;
      sticky.classList.toggle('is-visible', past);
      sticky.setAttribute('aria-hidden', past ? 'false' : 'true');
      stickyAdd.tabIndex = past ? 0 : -1;
    };
    window.addEventListener(
      'scroll',
      function () {
        if (!stickyFrame) stickyFrame = window.requestAnimationFrame(placeSticky);
      },
      { passive: true }
    );
    placeSticky();
  }

  /* Recently viewed, kept in this browser only. */
  var RECENT_KEY = 'pamuq_recent';
  var recent = [];
  try {
    recent = JSON.parse(window.localStorage.getItem(RECENT_KEY)) || [];
  } catch (error) {}
  if (!Array.isArray(recent)) recent = [];
  var others = recent.filter(function (entry) {
    return typeof entry === 'string' && entry !== slug;
  });
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify([slug].concat(others).slice(0, 12)));
  } catch (error) {}

  var recentBox = document.querySelector('[data-recent]');
  if (recentBox && others.length && cart && cart.catalog) {
    cart.catalog().then(function (products) {
      var bySlug = {};
      products.forEach(function (entry) {
        bySlug[entry.slug] = entry;
      });
      var list = recentBox.querySelector('[data-recent-list]');
      others.slice(0, 6).forEach(function (entry) {
        var item = bySlug[entry];
        if (!item) return;
        var li = document.createElement('li');
        li.innerHTML =
          '<a class="mini-card" href="/product/' + encodeURIComponent(item.slug) + '">' +
          '<span class="mini-card__media media"><img loading="lazy" decoding="async" alt=""></span>' +
          '<span class="mini-card__name"></span><span class="mini-card__price"></span></a>';
        li.querySelector('img').src = item.image;
        li.querySelector('.mini-card__name').textContent = item.name;
        li.querySelector('.mini-card__price').textContent = item.priceLabel;
        list.appendChild(li);
      });
      recentBox.hidden = list.children.length === 0;
    });
  }

  /* Reviews: the form, sorting and load more */

  var reviews = document.querySelector('[data-reviews]');
  if (reviews) {
    var form = reviews.querySelector('[data-review-form]');
    reviews.querySelectorAll('[data-review-toggle]').forEach(function (toggle) {
      toggle.addEventListener('click', function () {
        var open = form.hidden;
        form.hidden = !open;
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
          var first = form.querySelector('input[name="rating"]');
          if (first) first.focus();
        }
      });
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var status = form.querySelector('[data-review-status]');
      var data = {};
      new FormData(form).forEach(function (value, key) {
        data[key] = value;
      });
      if (!data.rating) {
        status.textContent = 'Please choose a rating from 1 to 5 stars.';
        return;
      }
      var submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      window
        .fetch('/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) })
        .then(function (response) {
          return response.json().then(function (result) {
            if (!response.ok) throw new Error(result.error || 'Your review could not be sent. Please try again.');
          });
        })
        .then(function () {
          form.reset();
          status.textContent = 'Thank you. Your review will appear here once we have checked it is from a real customer.';
        })
        .catch(function (error) {
          status.textContent = error instanceof TypeError ? 'We could not reach the shop. Please try again.' : error.message;
        })
        .then(function () {
          submit.disabled = false;
        });
    });

    var list = reviews.querySelector('[data-review-list]');
    var sort = reviews.querySelector('[data-review-sort]');
    var more = reviews.querySelector('[data-review-more]');
    var PAGE = 5;
    var visible = PAGE;
    var paint = function () {
      var items = Array.prototype.slice.call(list.querySelectorAll('[data-review]'));
      items.forEach(function (item, position) {
        item.hidden = position >= visible;
      });
      more.hidden = items.length <= visible;
    };
    if (list && sort) {
      sort.addEventListener('change', function () {
        var items = Array.prototype.slice.call(list.querySelectorAll('[data-review]'));
        var key = sort.value;
        items.sort(function (a, b) {
          var ra = Number(a.getAttribute('data-rating'));
          var rb = Number(b.getAttribute('data-rating'));
          var da = a.getAttribute('data-date');
          var db = b.getAttribute('data-date');
          if (key === 'highest') return rb - ra || (db > da ? 1 : -1);
          if (key === 'lowest') return ra - rb || (db > da ? 1 : -1);
          return db > da ? 1 : db < da ? -1 : 0;
        });
        items.forEach(function (item) {
          list.appendChild(item);
        });
        paint();
      });
      more.addEventListener('click', function () {
        visible += PAGE;
        paint();
      });
      paint();
    }
  }

  /* Start */

  images = (function () {
    var option = selectedOption();
    return option ? imagesOf(option) : [];
  })();
  counter.textContent = images.length > 1 ? '1 / ' + images.length : '';
  track('view_item', { item_id: (selectedOption() || {}).value, item_name: name, price: price / 100 });
})();
