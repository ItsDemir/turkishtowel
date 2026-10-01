/* The bag. Its contents live in localStorage under "pamuq_cart" and nowhere else:
   the server never keeps a basket. This file also owns the bag count in the header,
   the slide-in drawer and the bag page, which are two views of the same list. */
(function () {
  'use strict';

  var STORAGE_KEY = 'pamuq_cart';
  var MAX_QUANTITY = 10;
  var FREE_DELIVERY = parseInt(document.body.getAttribute('data-free-delivery'), 10) || 10000;
  var IMAGE_URL = /^(https:\/\/|\/(?!\/))/;

  var ICONS = {
    minus:
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M5 12h14"/></svg>',
    plus:
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M12 5v14"/><path d="M5 12h14"/></svg>'
  };

  var memoryItems = [];
  var storageWorks = (function () {
    try {
      window.localStorage.setItem('__pamuq_probe__', '1');
      window.localStorage.removeItem('__pamuq_probe__');
      return true;
    } catch (error) {
      return false;
    }
  })();

  /* Prices are integers in pence. Whole pounds drop the decimals: 6800 is "£68". */
  function formatPrice(pence) {
    var pounds = Math.floor(pence / 100);
    var rest = pence % 100;
    return '£' + pounds.toLocaleString('en-GB') + (rest ? '.' + (rest < 10 ? '0' : '') + rest : '');
  }

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
      colour: String(item.colour || ''),
      price: price,
      quantity: Math.min(quantity, MAX_QUANTITY),
      image: IMAGE_URL.test(image) ? image : ''
    };
  }

  function readItems() {
    if (!storageWorks) return memoryItems.slice();
    try {
      var parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      return Array.isArray(parsed) ? parsed.map(clean).filter(Boolean) : [];
    } catch (error) {
      return [];
    }
  }

  function writeItems(items) {
    if (storageWorks) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      } catch (error) {
        storageWorks = false;
        memoryItems = items.slice();
      }
    } else {
      memoryItems = items.slice();
    }
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
    return item.name + (item.colour ? ', ' + item.colour : '');
  }

  /* Changing the bag */

  function add(item) {
    var next = clean({
      id: item && item.id,
      slug: item && item.slug,
      name: item && item.name,
      colour: item && item.colour,
      price: item && item.price,
      quantity: (item && item.quantity) || 1,
      image: item && item.image
    });
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
    writeItems(items);
    announce(labelFor(next) + ' added to your bag.');
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
    var href = item.slug ? '/product/' + encodeURIComponent(item.slug) : '/collection';

    var picture = element('div', { class: 'line__image media' }, [
      item.image
        ? element('img', { src: item.image, alt: label, width: '160', height: '160', loading: 'lazy', decoding: 'async' })
        : null
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
      'aria-label': 'Remove ' + label + ' from your bag',
      text: 'Remove'
    });

    var body = element('div', { class: 'line__body' }, [
      element('a', { class: 'line__name', href: href, text: item.name }),
      item.colour ? element('p', { class: 'line__colour', text: item.colour }) : null,
      element('div', { class: 'line__controls' }, [stepper, removeButton])
    ]);

    return element('li', { class: 'line', 'data-id': item.id }, [
      picture,
      body,
      element('p', { class: 'line__price', text: formatPrice(item.price * item.quantity) })
    ]);
  }

  function deliveryNote(total) {
    if (total >= FREE_DELIVERY) return 'Free delivery on this order.';
    return 'Add ' + formatPrice(FREE_DELIVERY - total) + ' for free delivery.';
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
      link.setAttribute('aria-label', 'Bag, ' + quantity + (quantity === 1 ? ' item' : ' items'));
    });

    var focus = rememberFocus();

    document.querySelectorAll('[data-cart-view]').forEach(function (view) {
      var list = view.querySelector('[data-cart-items]');
      var empty = view.querySelector('[data-cart-empty]');
      var filled = view.querySelector('[data-cart-filled]');
      var title = view.querySelector('[data-cart-title]');
      var isEmpty = items.length === 0;

      if (list) {
        list.textContent = '';
        items.forEach(function (item) {
          list.appendChild(lineItem(item));
        });
      }
      if (empty) empty.hidden = !isEmpty;
      if (filled) filled.hidden = isEmpty;
      if (title) title.classList.toggle('visually-hidden', isEmpty);

      var amount = view.querySelector('[data-subtotal]');
      if (amount) amount.textContent = formatPrice(total);
      var note = view.querySelector('[data-delivery-note]');
      if (note) note.textContent = deliveryNote(total);
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
      target =
        line.querySelector('[data-action="' + focus.action + '"]:not(:disabled)') ||
        line.querySelector('[data-action]:not(:disabled)');
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
    return document.querySelectorAll('.skip-link, [data-site-header], main, .site-footer');
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

  /* Clicks */

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;

    var toggle = target.closest('[data-cart-toggle]');
    if (toggle) {
      var plain = event.button === 0 && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
      if (plain && drawer && document.body.getAttribute('data-page') !== 'cart') {
        event.preventDefault();
        open(toggle);
      }
      return;
    }

    if (target.closest('[data-drawer-close]')) {
      close();
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
      announce(labelFor(item) + ' removed from your bag.');
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
    var items = readItems().map(function (item) {
      return { id: item.id, quantity: item.quantity };
    });
    if (items.length === 0) return;

    if (message) message.textContent = '';
    setCheckoutBusy(button, true);

    window
      .fetch('/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items: items })
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

  /* The order is paid for, so the bag has done its job. */
  if (document.querySelector('[data-order-paid="true"]')) {
    writeItems([]);
  } else {
    render();
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
    format: formatPrice
  };
})();
