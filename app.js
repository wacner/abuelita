// ===== CONFIGURACIÓN =====
// La URL del backend se define en config.js (variable global APP_SCRIPT_URL)
// =========================

// ===== INICIALIZACIÓN =====
const tg = window.Telegram.WebApp;
tg.expand();

// Aplicar tema de Telegram
if (tg.themeParams.bg_color) {
  document.documentElement.style.setProperty('--color-fondo', tg.themeParams.bg_color);
}
if (tg.themeParams.text_color) {
  document.documentElement.style.setProperty('--color-texto', tg.themeParams.text_color);
}
if (tg.themeParams.button_color) {
  document.documentElement.style.setProperty('--color-primario', tg.themeParams.button_color);
}

// Obtener datos del usuario
let user = null;
if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
  user = tg.initDataUnsafe.user;
} else {
  // Fallback para desarrollo
  user = { id: 123456789, first_name: 'Test', last_name: 'User' };
}
const userId = user.id;
const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');

// ===== ESTADO GLOBAL =====
let menuData = null;
let currentCategory = '';
let cart = [];
let cartTotal = 0;
let deliveryData = null; // { phone, address }
let selectedFlavorItem = null; // para el modal de sabor
let isSubmitting = false;

// Referencias DOM
const screens = {
  splash: document.getElementById('splashScreen'),
  delivery: document.getElementById('deliveryScreen'),
  catalog: document.getElementById('catalogScreen'),
  cart: document.getElementById('cartScreen'),
  payment: document.getElementById('paymentScreen'),
  confirmation: document.getElementById('confirmationScreen')
};

const cartBadge = document.getElementById('cartBadge');
const fabCart = document.getElementById('fabCart');
const fabCount = document.getElementById('fabCount');
const cartItemsEl = document.getElementById('cartItems');
const cartTotalEl = document.getElementById('cartTotal');
const checkoutBtn = document.getElementById('checkoutBtn');
const notesInput = document.getElementById('notesInput');
const referenceInput = document.getElementById('referenceInput');
const submitBtn = document.getElementById('submitOrderBtn');
const paymentLoading = document.getElementById('paymentLoading');
const referenceError = document.getElementById('referenceError');

// ===== FUNCIONES DE NAVEGACIÓN =====
function showScreen(id) {
  Object.keys(screens).forEach(key => {
    const el = screens[key];
    el.classList.remove('active');
  });
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
  // Ocultar FAB en pantallas que no son catálogo
  if (id !== 'catalogScreen') {
    fabCart.style.display = 'none';
  } else {
    updateFabVisibility();
  }
}

// ===== CARGA DE MENÚ =====
async function loadMenu() {
  try {
    const resp = await fetch('menu.json');
    if (!resp.ok) throw new Error('Error al cargar menú');
    menuData = await resp.json();
    return true;
  } catch (e) {
    console.error('Error cargando menú:', e);
    return false;
  }
}

// ===== ALMACENAMIENTO LOCAL / CLOUD =====
function saveDeliveryData(phone, address) {
  deliveryData = { phone, address };
  // Guardar en CloudStorage si está disponible
  if (tg.CloudStorage) {
    tg.CloudStorage.setItem('delivery_phone', phone);
    tg.CloudStorage.setItem('delivery_address', address);
  }
  // También en localStorage
  localStorage.setItem('delivery_phone', phone);
  localStorage.setItem('delivery_address', address);
}

function loadDeliveryData() {
  return new Promise((resolve) => {
    if (tg.CloudStorage) {
      tg.CloudStorage.getItem('delivery_phone', (err, phone) => {
        if (err || !phone) {
          // Fallback a localStorage
          const phone2 = localStorage.getItem('delivery_phone');
          const address2 = localStorage.getItem('delivery_address');
          if (phone2 && address2) {
            deliveryData = { phone: phone2, address: address2 };
            resolve(true);
          } else {
            resolve(false);
          }
        } else {
          tg.CloudStorage.getItem('delivery_address', (err2, address) => {
            if (!err2 && address) {
              deliveryData = { phone, address };
              resolve(true);
            } else {
              resolve(false);
            }
          });
        }
      });
    } else {
      // Fallback localStorage
      const phone = localStorage.getItem('delivery_phone');
      const address = localStorage.getItem('delivery_address');
      if (phone && address) {
        deliveryData = { phone, address };
        resolve(true);
      } else {
        resolve(false);
      }
    }
  });
}

// ===== FORMULARIO DE ENTREGA =====
const phoneInput = document.getElementById('phoneInput');
const addressInput = document.getElementById('addressInput');
const phoneError = document.getElementById('phoneError');
const addressError = document.getElementById('addressError');
const deliveryForm = document.getElementById('deliveryForm');

function validatePhone(phone) {
  return /^04\d{9}$/.test(phone);
}

function validateAddress(addr) {
  return addr.trim().length >= 10;
}

deliveryForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const phone = phoneInput.value.trim();
  const address = addressInput.value.trim();
  let valid = true;
  if (!validatePhone(phone)) {
    phoneInput.parentElement.classList.add('error');
    valid = false;
  } else {
    phoneInput.parentElement.classList.remove('error');
  }
  if (!validateAddress(address)) {
    addressInput.parentElement.classList.add('error');
    valid = false;
  } else {
    addressInput.parentElement.classList.remove('error');
  }
  if (valid) {
    saveDeliveryData(phone, address);
    showCatalog();
  }
});

// ===== CATÁLOGO =====
function showCatalog() {
  showScreen('catalogScreen');
  renderCategories();
  renderItems(currentCategory || menuData.categorias[0].id);
  updateCartUI();
}

function renderCategories() {
  const tabsContainer = document.getElementById('categoryTabs');
  tabsContainer.innerHTML = '';
  menuData.categorias.forEach(cat => {
    const tab = document.createElement('button');
    tab.className = 'tab' + (cat.id === currentCategory ? ' active' : '');
    tab.textContent = cat.emoji + ' ' + cat.nombre;
    tab.dataset.id = cat.id;
    tab.addEventListener('click', () => {
      currentCategory = cat.id;
      renderCategories();
      renderItems(cat.id);
    });
    tabsContainer.appendChild(tab);
  });
}

function renderItems(categoryId) {
  const container = document.getElementById('itemsContainer');
  const category = menuData.categorias.find(c => c.id === categoryId);
  if (!category) return;
  container.innerHTML = '';
  category.items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'item-card' + (categoryId === 'combos' ? ' promocion' : '');
    const priceClass = categoryId === 'combos' ? 'promo-price' : '';
    card.innerHTML = `
      <div class="item-name">${item.nombre}</div>
      <div class="item-desc">${item.contenido}</div>
      <div class="item-price ${priceClass}">$${item.precio.toFixed(2)}</div>
      ${item.opciones_sabor && item.opciones_sabor.length > 0 ? `<div class="item-flavor-badge">🍽️ Elige sabor</div>` : ''}
      <button class="item-add" data-itemid="${item.id}">+</button>
    `;
    const addBtn = card.querySelector('.item-add');
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleAddItem(item);
    });
    // Tocar la tarjeta también agrega (excepto si tiene sabor, se abre modal)
    card.addEventListener('click', () => {
      if (item.opciones_sabor && item.opciones_sabor.length > 0) {
        openFlavorModal(item);
      } else {
        addToCart(item, null);
      }
    });
    container.appendChild(card);
  });
}

// ===== AGREGAR AL CARRITO =====
function handleAddItem(item) {
  if (item.opciones_sabor && item.opciones_sabor.length > 0) {
    openFlavorModal(item);
  } else {
    addToCart(item, null);
  }
}

function addToCart(item, flavor) {
  const entry = {
    id: item.id,
    nombre: item.nombre,
    categoria: getCategoryName(item.id),
    precio: item.precio,
    sabor: flavor,
    contenido: item.contenido
  };
  cart.push(entry);
  updateCartUI();
  // Feedback visual
  tg.HapticFeedback && tg.HapticFeedback.impactOccurred('light');
}

function getCategoryName(itemId) {
  for (let cat of menuData.categorias) {
    if (cat.items.some(it => it.id === itemId)) return cat.nombre;
  }
  return 'Otro';
}

// ===== MODAL DE SABOR =====
function openFlavorModal(item) {
  selectedFlavorItem = item;
  document.getElementById('flavorItemName').textContent = 'Elige sabor para ' + item.nombre;
  const optionsContainer = document.getElementById('flavorOptions');
  optionsContainer.innerHTML = '';
  let selected = null;
  item.opciones_sabor.forEach(sabor => {
    const btn = document.createElement('button');
    btn.textContent = sabor;
    btn.addEventListener('click', () => {
      optionsContainer.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selected = sabor;
    });
    optionsContainer.appendChild(btn);
  });
  document.getElementById('flavorModal').classList.add('active');
  // Confirmar
  document.getElementById('flavorConfirm').onclick = () => {
    if (!selected) {
      tg.showAlert && tg.showAlert('Por favor, elige un sabor.');
      return;
    }
    addToCart(selectedFlavorItem, selected);
    document.getElementById('flavorModal').classList.remove('active');
    selectedFlavorItem = null;
  };
  document.getElementById('flavorCancel').onclick = () => {
    document.getElementById('flavorModal').classList.remove('active');
    selectedFlavorItem = null;
  };
}

// ===== CARRITO =====
function updateCartUI() {
  // Actualizar badge y FAB
  const count = cart.length;
  cartBadge.textContent = count;
  fabCount.textContent = count;
  updateFabVisibility();

  // Actualizar contenido del carrito si está visible
  if (screens.cart.classList.contains('active')) {
    renderCartItems();
  }
}

function updateFabVisibility() {
  if (cart.length > 0 && screens.catalog.classList.contains('active')) {
    fabCart.style.display = 'flex';
  } else {
    fabCart.style.display = 'none';
  }
}

function renderCartItems() {
  const container = cartItemsEl;
  container.innerHTML = '';
  if (cart.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:var(--color-texto-suave);">Tu carrito está vacío.</p>';
    checkoutBtn.disabled = true;
    cartTotalEl.textContent = '$0.00';
    return;
  }
  let total = 0;
  cart.forEach((item, index) => {
    total += item.precio;
    const div = document.createElement('div');
    div.className = 'cart-item';
    div.innerHTML = `
      <div class="cart-item-info">
        <div class="cart-item-name">${item.nombre}</div>
        ${item.sabor ? `<div class="cart-item-flavor">Sabor: ${item.sabor}</div>` : ''}
      </div>
      <div class="cart-item-price">$${item.precio.toFixed(2)}</div>
      <button class="cart-item-remove" data-index="${index}">✕</button>
    `;
    const removeBtn = div.querySelector('.cart-item-remove');
    removeBtn.addEventListener('click', () => {
      cart.splice(index, 1);
      renderCartItems();
      updateCartUI();
    });
    container.appendChild(div);
  });
  cartTotal = total;
  cartTotalEl.textContent = '$' + total.toFixed(2);
  checkoutBtn.disabled = false;
}

// ===== NAVEGACIÓN ENTRE CATÁLOGO Y CARRITO =====
fabCart.addEventListener('click', () => {
  showScreen('cartScreen');
  renderCartItems();
});

document.getElementById('cartBackBtn').addEventListener('click', () => {
  showCatalog();
});

checkoutBtn.addEventListener('click', () => {
  showScreen('paymentScreen');
  // Prellenar referencia vacía
  referenceInput.value = '';
  referenceInput.parentElement.classList.remove('error');
  submitBtn.disabled = true;
  paymentLoading.style.display = 'none';
});

// ===== PAGO =====
referenceInput.addEventListener('input', () => {
  const val = referenceInput.value.trim();
  const isValid = /^\d{6}$/.test(val);
  if (val.length > 0 && !isValid) {
    referenceInput.parentElement.classList.add('error');
  } else {
    referenceInput.parentElement.classList.remove('error');
  }
  submitBtn.disabled = !isValid;
});

// ===== ENVÍO DEL PEDIDO =====
submitBtn.addEventListener('click', async () => {
  if (isSubmitting) return;
  const ref = referenceInput.value.trim();
  if (!/^\d{6}$/.test(ref)) {
    referenceInput.parentElement.classList.add('error');
    return;
  }
  // Deshabilitar botón y mostrar carga
  isSubmitting = true;
  submitBtn.disabled = true;
  paymentLoading.style.display = 'block';

  // Construir payload
  const payload = {
    telegram_id: userId,
    nombre: userName,
    telefono: deliveryData.phone,
    direccion: deliveryData.address,
    pedido_detalle: cart.map(item => ({
      categoria: item.categoria,
      item: item.nombre,
      sabor: item.sabor || null,
      precio: item.precio
    })),
    notas: notesInput.value.trim() || '',
    precio_total: cartTotal,
    referencia_pago: ref,
    init_data: tg.initData || '' // Telegram firma
  };

  try {
    const response = await fetch(APP_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (result.ok) {
      // Éxito
      showConfirmation(payload);
    } else {
      // Error del backend
      tg.showAlert && tg.showAlert('Error: ' + (result.error || 'No se pudo registrar el pedido.'));
      // Rehabilitar botón
      submitBtn.disabled = false;
      paymentLoading.style.display = 'none';
      isSubmitting = false;
    }
  } catch (e) {
    console.error('Error de red:', e);
    tg.showAlert && tg.showAlert('Error de conexión. Intenta de nuevo.');
    submitBtn.disabled = false;
    paymentLoading.style.display = 'none';
    isSubmitting = false;
  }
});

function showConfirmation(payload) {
  // Guardar datos para mostrar en confirmación
  document.getElementById('confirmName').textContent = payload.nombre;
  document.getElementById('confirmTotal').textContent = '$' + payload.precio_total.toFixed(2);
  document.getElementById('confirmRef').textContent = payload.referencia_pago;
  document.getElementById('confirmAddress').textContent = payload.direccion;
  document.getElementById('confirmPhone').textContent = payload.telefono;
  document.getElementById('confirmNotes').textContent = payload.notas || 'Ninguna';

  const itemsContainer = document.getElementById('confirmItems');
  itemsContainer.innerHTML = '';
  payload.pedido_detalle.forEach(item => {
    const p = document.createElement('p');
    p.textContent = `${item.item}${item.sabor ? ' ('+item.sabor+')' : ''} - $${item.precio.toFixed(2)}`;
    itemsContainer.appendChild(p);
  });

  showScreen('confirmationScreen');
  // Limpiar carrito
  cart = [];
  updateCartUI();
  isSubmitting = false;
  // Resetear pago
  submitBtn.disabled = true;
  paymentLoading.style.display = 'none';
}

// ===== NUEVO PEDIDO =====
document.getElementById('newOrderBtn').addEventListener('click', () => {
  showCatalog();
});

// ===== INICIO =====
async function init() {
  // Mostrar splash
  showScreen('splashScreen');

  // Cargar menú
  const loaded = await loadMenu();
  if (!loaded) {
    tg.showAlert && tg.showAlert('Error al cargar el menú. Reintenta.');
    return;
  }

  // Esperar 2 segundos (mínimo)
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Verificar si ya hay datos de entrega guardados
  const hasDelivery = await loadDeliveryData();
  if (hasDelivery && deliveryData) {
    showCatalog();
  } else {
    showScreen('deliveryScreen');
  }
}

// Iniciar
init();