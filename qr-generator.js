// ─────────────────────────────────────────────────
//  qr-generator.js  —  Panel del Docente
//  Genera tokens aleatorios y rota el QR cada N segundos
// ─────────────────────────────────────────────────


let qrInstance = null;    // instancia de QRCode.js
let countdownInterval = null;
let tiempoRestante = 30;
let INTERVALO_SEG = 30;
let BASE_URL = '';
let MATERIA = '';


// Genera un token aleatorio de 12 caracteres
function generarToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let token = '';
  for (let i = 0; i < 12; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}


// Construye la URL completa para el QR
// El token se pasa como parámetro ?t= para que Apps Script lo valide
function buildURL(token) {
  const url = new URL(BASE_URL);
  url.searchParams.set('t', token);
  url.searchParams.set('m', encodeURIComponent(MATERIA));
  return url.toString();
}


// Genera (o reemplaza) el QR con un nuevo token
// BUSCÁ ESTA FUNCIÓN EN TU qr-generator.js Y DEJALA ASÍ:
function generarNuevoQR() {
  const token = generarToken();
  const url = buildURL(token);


  // ─── AQUÍ REEMPLAZAMOS EL FETCH POR ESTO (EVITA EL ERROR DE CORS) ───
  // Si ya existía un script de un token anterior, lo borramos
  const antiguoScript = document.getElementById('jsonp-token');
  if (antiguoScript) antiguoScript.remove();


  // Creamos una etiqueta <script> "fantasma" para mandar el token a Google de forma segura
  const script = document.createElement('script');
  script.id = 'jsonp-token';
  script.src = `${BASE_URL}?action=registrar_token&t=${token}&callback=jsonpCallback`;
  document.body.appendChild(script);
  // ───────────────────────────────────────────────────────────────────


  // Mostrar token en pantalla (sólo para debug del docente)
  document.getElementById('token-display').textContent = `token: ${token}`;


  // Borrar QR anterior
  const contenedor = document.getElementById('qr-container');
  contenedor.classList.add('refreshing');


  setTimeout(() => {
    contenedor.innerHTML = '';
    qrInstance = new QRCode(contenedor, {
      text: url,
      width: 220,
      height: 220,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
    contenedor.classList.remove('refreshing');
  }, 300);


  // Reiniciar el anillo de cuenta regresiva
  tiempoRestante = INTERVALO_SEG;
  actualizarAnillo();
}


// Actualiza el anillo SVG de cuenta regresiva
function actualizarAnillo() {
  const ring = document.getElementById('ring');
  const timerNum = document.getElementById('timer-num');
  const CIRCUMFERENCIA = 188; // 2π × 30


  const fraccion = tiempoRestante / INTERVALO_SEG;
  ring.style.strokeDashoffset = CIRCUMFERENCIA * (1 - fraccion);


  // Color: verde → amarillo → rojo
  if (fraccion > 0.5) {
    ring.style.stroke = '#4f8ef7';
  } else if (fraccion > 0.25) {
    ring.style.stroke = '#f5a623';
  } else {
    ring.style.stroke = '#f05252';
  }


  timerNum.textContent = tiempoRestante;
}


// Tick del countdown
function tick() {
  tiempoRestante--;
  actualizarAnillo();


  if (tiempoRestante <= 0) {
    generarNuevoQR(); // rota el QR
  }
}


// Inicia la sesión de clase
function iniciarClase() {
  const urlInput = document.getElementById('input-url').value.trim();
  const materiaInput = document.getElementById('input-materia').value.trim();
  const intervaloInput = parseInt(document.getElementById('input-intervalo').value);


  if (!urlInput) {
    alert('Por favor ingresá la URL de tu Web App de Apps Script.');
    return;
  }
  if (!materiaInput) {
    alert('Por favor ingresá el nombre de la materia.');
    return;
  }


  // Validar que la URL tenga formato razonable
  try {
    new URL(urlInput);
  } catch {
    alert('La URL ingresada no es válida. Revisá que empiece con https://');
    return;
  }


  BASE_URL = urlInput;
  MATERIA = materiaInput;
  INTERVALO_SEG = intervaloInput;
  tiempoRestante = INTERVALO_SEG;


  // Mostrar card del QR, ocultar configuración
  document.getElementById('qr-card').style.display = 'flex';
  document.getElementById('materia-badge').textContent = materiaInput;


  // Generar el primer QR
  generarNuevoQR();


  // Arrancar el countdown
  countdownInterval = setInterval(tick, 1000);
}


// Detiene la sesión
function detenerClase() {
  if (!confirm('¿Querés finalizar la clase? El QR dejará de funcionar.')) return;


  clearInterval(countdownInterval);
  document.getElementById('qr-card').style.display = 'none';
  document.getElementById('qr-container').innerHTML = '';
  qrInstance = null;
}


// Agregá esto al final de tu qr-generator.js
function jsonpCallback(response) {
  // Esta función se ejecuta automáticamente cuando Google Apps Script confirma
  // que guardó el token con éxito. Podés dejarla vacía o meter un console.log
  console.log("Token registrado en el servidor exitosamente.");
}

