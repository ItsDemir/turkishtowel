/* The cart. Its contents live in localStorage under "pamuq_cart" and nowhere else: the
   server never keeps a cart. This file also owns the cart count in the header, the
   slide-in drawer, the cart page, the free shipping progress, the suggestions that close
   the gap, and the gift options. It also defines PamuqTrack for analytics events. */
(function () {
  'use strict';

  var STORAGE_KEY = 'pamuq_cart';
  var GIFT_KEY = 'pamuq_gift';
  var MAX_QUANTITY = 10;
  var body = document.body;
  var LOCALE = body.getAttribute('data-locale') || 'en-US';
  var CURRENCY = body.getAttribute('data-currency') || 'USD';
  var FREE_SHIPPING = parseInt(body.getAttribute('data-free-shipping'), 10) || 10000;
  var GIFT_MAX = parseInt(body.getAttribute('data-gift-max'), 10) || 200;
  var IMAGE_URL = /^(https:\/\/|\/(?!\/))/;

  var ICONS = {
    minus:
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M5 12h14"/></svg>',
    plus:
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M12 5v14"/><path d="M5 12h14"/></svg>'
  };

  /* Analytics. Events go to Vercel Web Analytics when it is switched on, and are ignored
     otherwise. Names follow the GA4 e-commerce events so another tool can be added here. */
  window.PamuqTrack = function (name, data) {
    try {
      if (typeof window.va === 'function') window.va('event', { name: name, data: data || {} });
      if (typeof window.gtag === 'function') window.gtag('event', name, data || {});
    } catch (error) {}
  };
  var track = window.PamuqTrack;

  var memory = {};
  function storageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return memory[key] === undefined ? null : memory[key];
    }
  }
  function storageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      memory[key] = value;
    }
  }

  /* Prices are integers in cents. Whole dollars drop the decimals: 5800 is "$58". */
  var wholeFormat = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY, minimumFractionDigits: 0, maximumFractionDigits: 0 });
  var centsFormat = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY });
  function formatPrice(cents) {
    var amount = Math.round(Number(cents) || 0);
    return amount % 100 === 0 ? wholeFormat.format(amount / 100) : centsFormat.format(amount / 100);
  }

  /* Items saved before the US launch spelled color the British way. */
  function clean(item) {
    if (!item || typeof item.id !== 'string' || !item.id) return null;
    var quantity = Math.floor(Number(item.quantity));
    var price = Math.floor(Number(item.price));
    if (!(quantity >= 1) || !(price >= 0)) return null;
    var image = String(item.image || '');
    return {
      id: item.id,
      slug: String(item.slug || ''),
      name: String(item.name || ''),
      color: String(item.color || item.colour || ''),
      price: price,
      quantity: Math.min(quantity, MAX_QUANTITY),
      image: IMAGE_URL.test(image) ? image : ''
    };
  }

  function readItems() {
    try {
      var parsed = JSON.parse(storageGet(STORAGE_KEY));
      return Array.isArray(parsed) ? parsed.map(clean).filter(Boolean) : [];
    } catch (error) {
      return [];
    }
  }

  function writeItems(items) {
    storageSet(STORAGE_KEY, JSON.stringify(items));
    changed();
  }

  function count() {
    return readItems().reduce(function (sum, item) {
      return sum + item.quantity;
    }, 0);
  }

  function subtotal(items) {
    return items.reduce(function (sum, item) {
      return sum + item.price * item.quantity;
    }, 0);
  }

  function labelFor(item) {
    return item.name + (item.color ? ', ' + item.color : '');
  }

  /* Changing the cart */

  var lastAdded = null;

  function add(item) {
    var next = clean(item);
    if (!next) return;

    var items = readItems();
    var existing = items.filter(function (entry) {
      return entry.id === next.id;
    })[0];
    if (existing) {
      existing.quantity = Math.min(existing.quantity + next.quantity, MAX_QUANTITY);
    } else {
      items.push(next);
    }
    lastAdded = next.id;
    writeItems(items);
    bumpCount();
    announce(labelFor(next) + ' added to your cart.');
    track('add_to_cart', { item_id: next.id, item_name: next.name, item_variant: next.color, price: next.price / 100, quantity: next.quantity, currency: CURRENCY });
  }

  function setQuantity(id, quantity) {
    var items = readItems();
    items.forEach(function (item) {
      if (item.id === id) item.quantity = Math.max(1, Math.min(quantity, MAX_QUANTITY));
    });
    writeItems(items);
  }

  function remove(id) {
    writeItems(
      readItems().filter(function (item) {
        return item.id !== id;
      })
    );
  }

  function clear() {
    writeItems([]);
  }

  function changed() {
    render();
    document.dispatchEvent(new CustomEvent('pamuq:cart'));
  }

  /* Prices, names and pictures are checked with the shop once per page, so a cart saved
     before a price change, or holding something no longer sold, is put right. */
  function refresh() {
    var items = readItems();
    if (items.length === 0) return;
    var ids = items.map(function (item) {
      return item.id;
    });
    window
      .fetch('/api/cart?ids=' + encodeURIComponent(ids.join(',')), { headers: { Accept: 'application/json' } })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (data) {
        if (!data || !data.items) return;
        var removed = [];
        var current = readItems()
          .map(function (item) {
            var fresh = data.items[item.id];
            if (!fresh) {
              removed.push(item.name);
              return null;
            }
            return { id: item.id, slug: fresh.slug, name: fresh.name, color: fresh.color, price: fresh.price, quantity: item.quantity, image: fresh.image };
          })
          .filter(Boolean);
        storageSet(STORAGE_KEY, JSON.stringify(current));
        changed();
        if (removed.length) {
          var notice = removed.join(', ') + (removed.length === 1 ? ' is' : ' are') + ' no longer sold and has been removed from your cart.';
          document.querySelectorAll('[data-checkout-message]').forEach(function (message) {
            message.textContent = notice;
          });
          announce(notice);
        }
      })
      .catch(function () {});
  }

  /* Rendering */

  function element(tag, props, children) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (key) {
      var value = props[key];
      if (key === 'text') node.textContent = value;
      else if (key === 'class') node.className = value;
      else if (value === true) node.setAttribute(key, '');
      else if (value !== false && value != null) node.setAttribute(key, value);
    });
    (children || []).forEach(function (child) {
      if (child) node.appendChild(child);
    });
    return node;
  }

  function stepButton(action, icon, label, disabled) {
    var button = element('button', { type: 'button', 'data-action': action, 'aria-label': label, disabled: disabled });
    button.innerHTML = icon;
    return button;
  }

  function lineItem(item) {
    var label = labelFor(item);
    var href = item.slug ? '/product/' + encodeURIComponent(item.slug) : '/shop';

    var picture = element('div', { class: 'line__image media' }, [
      item.image ? element('img', { src: item.image, alt: label, width: '160', height: '200', loading: 'lazy', decoding: 'async' }) : null
    ]);

    var stepper = element('div', { class: 'stepper', role: 'group', 'aria-label': 'Quantity of ' + label }, [
      stepButton('decrease', ICONS.minus, 'Decrease quantity of ' + label, item.quantity <= 1),
      element('span', { class: 'stepper__value', text: String(item.quantity) }),
      stepButton('increase', ICONS.plus, 'Increase quantity of ' + label, item.quantity >= MAX_QUANTITY)
    ]);

    var removeButton = element('button', {
      type: 'button',
      class: 'link-button',
      'data-action': 'remove',
      'aria-label': 'Remove ' + label + ' from your cart',
      text: 'Remove'
    });

    var details = element('div', { class: 'line__body' }, [
      element('a', { class: 'line__name', href: href, text: item.name }),
      item.color ? element('p', { class: 'line__color', text: item.color }) : null,
      element('div', { class: 'line__controls' }, [stepper, removeButton])
    ]);

    return element('li', { class: 'line' + (item.id === lastAdded ? ' is-new' : ''), 'data-id': item.id }, [
      picture,
      details,
      element('p', { class: 'line__price', text: formatPrice(item.price * item.quantity) })
    ]);
  }

  function shippingProgress(view, total, isEmpty) {
    var box = view.querySelector('[data-ship-progress]');
    if (!box) return;
    box.hidden = isEmpty;
    if (isEmpty) return;
    var gap = FREE_SHIPPING - total;
    var text = box.querySelector('[data-ship-text]');
    var bar = box.querySelector('[data-ship-bar]');
    box.classList.toggle('is-complete', gap <= 0);
    text.textContent = gap > 0 ? "You're " + formatPrice(gap) + ' away from free US shipping.' : "You've unlocked free US shipping.";
    bar.style.width = Math.min(100, Math.round((total / FREE_SHIPPING) * 100)) + '%';
  }

  /* Suggestions: low cost pieces that close the gap to free shipping, in the color
     already in the cart where possible. */
  var catalog = null;
  var catalogRequest = null;

  function loadCatalog() {
    if (catalog) return Promise.resolve(catalog);
    if (!catalogRequest) {
      catalogRequest = window
        .fetch('/catalog.json', { headers: { Accept: 'application/json' } })
        .then(function (response) {
          return response.ok ? response.json() : { products: [] };
        })
        .then(function (data) {
          catalog = data.products || [];
          return catalog;
        })
        .catch(function () {
          catalogRequest = null;
          return [];
        });
    }
    return catalogRequest;
  }

  function suggestions(items, products) {
    var gap = FREE_SHIPPING - subtotal(items);
    var inCart = {};
    items.forEach(function (item) {
      inCart[item.slug] = true;
    });
    var preferred = items.length ? items[items.length - 1].color : '';
    var candidates = products.filter(function (product) {
      return !product.isSet && !inCart[product.slug] && product.price <= 4000;
    });
    candidates.sort(function (a, b) {
      if (gap > 0) {
        var closesA = a.price >= gap ? 0 : 1;
        var closesB = b.price >= gap ? 0 : 1;
        if (closesA !== closesB) return closesA - closesB;
      }
      return a.price - b.price;
    });
    return candidates.slice(0, 3).map(function (product) {
      var color =
        product.colors.filter(function (option) {
          return option.name === preferred && option.stock > 0;
        })[0] ||
        product.colors.filter(function (option) {
          return option.stock > 0;
        })[0];
      return color ? { product: product, color: color } : null;
    }).filter(Boolean);
  }

  function renderSuggestions(view, items) {
    var box = view.querySelector('[data-suggest]');
    if (!box) return;
    if (items.length === 0) {
      box.hidden = true;
      return;
    }
    loadCatalog().then(function (products) {
      var picks = suggestions(readItems(), products);
      var list = box.querySelector('[data-suggest-list]');
      var title = box.querySelector('[data-suggest-title]');
      var gap = FREE_SHIPPING - subtotal(readItems());
      title.textContent = gap > 0 ? 'Add a little, ship for free' : 'Complete the set';
      list.textContent = '';
      picks.forEach(function (pick) {
        var button = element('button', {
          class: 'suggest__add',
          type: 'button',
          'data-suggest-add': '',
          'data-id': pick.color.sku,
          'data-slug': pick.product.slug,
          'data-name': pick.product.name,
          'data-color': pick.color.name,
          'data-price': String(pick.product.price),
          'data-image': pick.color.image,
          'aria-label': 'Add ' + pick.product.name + ' in ' + pick.color.name + ' to your cart',
          text: 'Add'
        });
        list.appendChild(
          element('li', { class: 'suggest__item' }, [
            element('a', { class: 'suggest__link', href: '/product/' + pick.product.slug }, [
              element('span', { class: 'suggest__media media' }, [element('img', { src: pick.color.image, alt: '', loading: 'lazy', decoding: 'async' })]),
              element('span', {}, [
                element('span', { class: 'suggest__name', text: pick.product.name }),
                element('span', { class: 'suggest__meta', text: pick.color.name + ' · ' + pick.product.priceLabel })
              ])
            ]),
            button
          ])
        );
      });
      box.hidden = picks.length === 0;
    });
  }

  function bumpCount() {
    document.querySelectorAll('[data-cart-count]').forEach(function (badge) {
      badge.classList.remove('is-bumped');
      void badge.offsetWidth;
      badge.classList.add('is-bumped');
    });
  }

  function render() {
    var items = readItems();
    var total = subtotal(items);
    var quantity = items.reduce(function (sum, item) {
      return sum + item.quantity;
    }, 0);

    document.querySelectorAll('[data-cart-count]').forEach(function (badge) {
      badge.textContent = quantity > 99 ? '99+' : String(quantity);
      badge.hidden = quantity === 0;
    });
    document.querySelectorAll('[data-cart-toggle]').forEach(function (link) {
      link.setAttribute('aria-label', 'Cart, ' + quantity + (quantity === 1 ? ' item' : ' items'));
    });

    var focus = rememberFocus();

    document.querySelectorAll('[data-cart-view]').forEach(function (view) {
      var list = view.querySelector('[data-cart-items]');
      var empty = view.querySelector('[data-cart-empty]');
      var filled = view.querySelectorAll('[data-cart-filled]');
      var title = view.querySelector('[data-cart-title]');
      var isEmpty = items.length === 0;

      if (list) {
        list.textContent = '';
        items.forEach(function (item) {
          list.appendChild(lineItem(item));
        });
      }
      if (empty) empty.hidden = !isEmpty;
      filled.forEach(function (node) {
        node.hidden = isEmpty;
      });
      if (title) title.classList.toggle('visually-hidden', isEmpty);

      var amount = view.querySelector('[data-subtotal]');
      if (amount) amount.textContent = formatPrice(total);
      shippingProgress(view, total, isEmpty);
      renderSuggestions(view, items);
    });

    /* The drawer's footer sits outside its view list on some layouts. */
    document.querySelectorAll('[data-drawer] [data-cart-filled]').forEach(function (node) {
      node.hidden = items.length === 0;
    });

    restoreFocus(focus);
  }

  /* Rebuilding the list would drop keyboard focus, so put it back on the same control. */
  function rememberFocus() {
    var active = document.activeElement;
    var line = active && active.closest ? active.closest('[data-id]') : null;
    var view = active && active.closest ? active.closest('[data-cart-view]') : null;
    if (!line || !view || !active.getAttribute('data-action')) return null;
    return { view: view, id: line.getAttribute('data-id'), action: active.getAttribute('data-action') };
  }

  function restoreFocus(focus) {
    if (!focus) return;
    var line = null;
    focus.view.querySelectorAll('[data-id]').forEach(function (candidate) {
      if (candidate.getAttribute('data-id') === focus.id) line = candidate;
    });

    var target = null;
    if (line) {
      target = line.querySelector('[data-action="' + focus.action + '"]:not(:disabled)') || line.querySelector('[data-action]:not(:disabled)');
    } else {
      target =
        focus.view.querySelector('[data-cart-items] [data-action]:not(:disabled)') ||
        focus.view.querySelector('[data-cart-empty] a') ||
        focus.view.querySelector('[data-drawer-close]');
    }
    if (target) target.focus();
  }

  function announce(message) {
    var live = document.querySelector('[data-cart-live]');
    if (live) live.textContent = message;
  }

  /* Drawer */

  var drawer = document.querySelector('[data-drawer]');
  var backdrop = document.querySelector('[data-drawer-backdrop]');
  var drawerTrigger = null;
  var root = document.documentElement;

  /* Everything behind the open drawer is made inert, which also keeps Tab inside it. */
  function pageRegions() {
    return document.querySelectorAll('.skip-link, [data-site-top], main, .site-footer');
  }

  function isOpen() {
    return root.classList.contains('drawer-open');
  }

  function open(trigger) {
    if (!drawer || isOpen()) return;
    drawerTrigger = trigger || document.activeElement;
    drawer.setAttribute('aria-hidden', 'false');
    pageRegions().forEach(function (region) {
      region.inert = true;
    });
    root.classList.add('drawer-open');
    var closeButton = drawer.querySelector('[data-drawer-close]');
    (closeButton || drawer).focus();
    track('view_cart', { currency: CURRENCY, value: subtotal(readItems()) / 100 });
  }

  function close() {
    if (!drawer || !isOpen()) return;
    root.classList.remove('drawer-open');
    drawer.setAttribute('aria-hidden', 'true');
    pageRegions().forEach(function (region) {
      region.inert = false;
    });
    if (drawerTrigger && document.contains(drawerTrigger)) drawerTrigger.focus();
    drawerTrigger = null;
  }

  if (backdrop) backdrop.addEventListener('click', close);

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && isOpen()) {
      event.preventDefault();
      close();
    }
  });

  /* Gift options on the cart page */

  function readGift() {
    try {
      var gift = JSON.parse(storageGet(GIFT_KEY));
      return gift && typeof gift === 'object' ? gift : null;
    } catch (error) {
      return null;
    }
  }

  var giftBox = document.querySelector('[data-gift]');
  if (giftBox) {
    var toggle = giftBox.querySelector('[data-gift-toggle]');
    var fields = giftBox.querySelector('[data-gift-fields]');
    var message = giftBox.querySelector('[data-gift-message]');
    var hide = giftBox.querySelector('[data-gift-hide]');
    var counter = giftBox.querySelector('[data-gift-count]');
    var saved = readGift();
    if (saved) {
      toggle.checked = Boolean(saved.isGift);
      message.value = String(saved.message || '').slice(0, GIFT_MAX);
      hide.checked = saved.hidePrices !== false;
    }
    var sync = function () {
      fields.hidden = !toggle.checked;
      counter.textContent = GIFT_MAX - message.value.length + ' characters left';
      storageSet(GIFT_KEY, JSON.stringify({ isGift: toggle.checked, message: message.value, hidePrices: hide.checked }));
    };
    [toggle, message, hide].forEach(function (control) {
      control.addEventListener('input', sync);
      control.addEventListener('change', sync);
    });
    sync();
  }

  /* Clicks */

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;

    var toggleLink = target.closest('[data-cart-toggle]');
    if (toggleLink) {
      var plain = event.button === 0 && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
      if (plain && drawer && body.getAttribute('data-page') !== 'cart') {
        event.preventDefault();
        open(toggleLink);
      }
      return;
    }

    if (target.closest('[data-drawer-close]')) {
      close();
      return;
    }

    var quick = target.closest('[data-quick-add], [data-suggest-add]');
    if (quick) {
      add({
        id: quick.getAttribute('data-id'),
        slug: quick.getAttribute('data-slug'),
        name: quick.getAttribute('data-name'),
        color: quick.getAttribute('data-color'),
        price: parseInt(quick.getAttribute('data-price'), 10),
        quantity: 1,
        image: quick.getAttribute('data-image')
      });
      if (quick.hasAttribute('data-quick-add')) open(quick);
      return;
    }

    var checkoutButton = target.closest('[data-checkout]');
    if (checkoutButton) {
      checkout(checkoutButton);
      return;
    }

    var control = target.closest('[data-action]');
    var line = control && control.closest('[data-id]');
    if (!control || !line) return;

    var id = line.getAttribute('data-id');
    var item = readItems().filter(function (entry) {
      return entry.id === id;
    })[0];
    if (!item) return;

    var action = control.getAttribute('data-action');
    if (action === 'increase') {
      setQuantity(id, item.quantity + 1);
      announce(labelFor(item) + ', quantity ' + Math.min(item.quantity + 1, MAX_QUANTITY) + '.');
    } else if (action === 'decrease') {
      setQuantity(id, item.quantity - 1);
      announce(labelFor(item) + ', quantity ' + Math.max(item.quantity - 1, 1) + '.');
    } else if (action === 'remove') {
      remove(id);
      announce(labelFor(item) + ' removed from your cart.');
    }
  });

  /* Checkout */

  function setCheckoutBusy(button, busy) {
    button.disabled = busy;
    if (busy) button.setAttribute('aria-busy', 'true');
    else button.removeAttribute('aria-busy');
  }

  function checkout(button) {
    var view = button.closest('[data-cart-view]');
    var message = view && view.querySelector('[data-checkout-message]');
    var current = readItems();
    var items = current.map(function (item) {
      return { id: item.id, quantity: item.quantity };
    });
    if (items.length === 0) return;

    var gift = readGift();
    if (message) message.textContent = '';
    setCheckoutBusy(button, true);
    track('begin_checkout', { currency: CURRENCY, value: subtotal(current) / 100 });

    window
      .fetch('/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items: items, gift: gift && gift.isGift ? gift : null })
      })
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            return { ok: response.ok, data: data };
          });
      })
      .then(function (result) {
        if (result.ok && result.data.url) {
          window.location.assign(result.data.url);
          return;
        }
        throw new Error(result.data.error || 'We could not start checkout. Please try again.');
      })
      .catch(function (error) {
        var offline = error instanceof TypeError;
        if (message) {
          message.textContent = offline ? 'We could not reach the shop. Please check your connection and try again.' : error.message;
        }
        setCheckoutBusy(button, false);
      });
  }

  /* Coming back from Stripe with the back button restores this page as it was left. */
  window.addEventListener('pageshow', function (event) {
    if (!event.persisted) return;
    document.querySelectorAll('[data-checkout]').forEach(function (button) {
      setCheckoutBusy(button, false);
    });
  });

  /* A change made in another tab. */
  window.addEventListener('storage', function (event) {
    if (event.key === STORAGE_KEY || event.key === null) render();
  });

  /* The order is paid for, so the cart has done its job. */
  if (document.querySelector('[data-order-paid="true"]')) {
    var paid = readItems();
    track('purchase', { currency: CURRENCY, value: subtotal(paid) / 100 });
    writeItems([]);
    storageSet(GIFT_KEY, '');
  } else {
    render();
    refresh();
    if (body.getAttribute('data-page') === 'cart') track('view_cart', { currency: CURRENCY, value: subtotal(readItems()) / 100 });
  }

  window.PamuqCart = {
    items: readItems,
    count: count,
    add: add,
    setQuantity: setQuantity,
    remove: remove,
    clear: clear,
    open: open,
    close: close,
    format: formatPrice,
    catalog: loadCatalog
  };
})();
