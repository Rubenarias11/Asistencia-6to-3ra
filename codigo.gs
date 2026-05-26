// ==========================================
// CONFIGURACIÓN GLOBAL DEL SISTEMA
// ==========================================
var CONFIG = {
  SPREADSHEET_ID: '1s16g204YIKCDSF3kk76rjTZ8nPmwgrRJFpzILlKNakQ',
  NOMBRE_HOJA: 'Ruben Arias',
  LAT_AULA: -34.622790,
  LNG_AULA: -58.541131,
  RADIO_METROS: 500,
  VALIDEZ_TOKEN_SEG: 300,
};

// ==========================================
// FUNCIÓN PRINCIPAL: doGet
// ==========================================
function doGet(e) {
  var params = e.parameter;
  var action = params.action || params.accion || 'formulario';

  // ─── REGISTRO DE ASISTENCIA DIRECTO EN TU SOLAPA (CORREGIDO) ───
  // ─── REGISTRO DE ASISTENCIA CON DETECTOR DE DUPLICADOS ───
  if (action === 'registrar_asistencia') {
    try {
      var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      var sheet = ss.getSheetByName(CONFIG.NOMBRE_HOJA); 
      
      if (!sheet) {
        throw new Error("No se encontró la solapa '" + CONFIG.NOMBRE_HOJA + "'. Revisá el Sheets.");
      }

      var emailAlumno = (params.email || '').trim().toLowerCase();
      var marcaDuplicado = "No"; // Por defecto no está duplicado

      // LÓGICA ANTI-DUPLICADOS: Escaneamos el Excel si el alumno ya metió el mail hoy
      if (emailAlumno !== '') {
        var data = sheet.getDataRange().getValues();
        var hoyString = new Date().toDateString(); // Fecha de hoy para comparar puro el día
        
        // Empezamos desde la fila 1 (saltando cabeceras si las hay)
        for (var i = 1; i < data.length; i++) {
          var filaEmail = (data[i][6] || '').toString().trim().toLowerCase(); // Columna G: Email
          var filaFecha = data[i][0]; // Columna A: Timestamp
          
          if (filaEmail === emailAlumno && filaFecha instanceof Date) {
            if (filaFecha.toDateString() === hoyString) {
              marcaDuplicado = "SÍ (Duplicado)"; // ¡Se detectó la repetición el mismo día!
              break; 
            }
          }
        }
      }
      
      // Clavamos la fila manteniendo intacto tu orden original (Agregamos Email en Columna G y Duplicado en H)
      sheet.appendRow([
        new Date(),                  // Columna A: Fecha y Hora
        params.apellido || '',       // Columna B: Apellido (Primero, como estaba antes)
        params.nombre || '',         // Columna C: Nombre
        params.pc || '',             // Columna D: Nro PC
        params.llegada || '',        // Columna E: Estado de llegada
        params.observaciones || '',  // Columna F: Observaciones
        emailAlumno,                 // Columna G: NUEVO CAMPO EMAIL
        marcaDuplicado               // Columna H: MARCA DE ALERTA DUPLICADO
      ]);
      
      SpreadsheetApp.flush();

    } catch(err) {
      Logger.log("ALERTA: " + err.message);
    }

    return ContentService.createTextOutput("OK");
  }

  // 1. Endpoint para registrar el token (Panel del Docente - JSONP)
  if (action === 'registrar_token') {
    var tok = params.t;
    if (tok) {
      var props = PropertiesService.getScriptProperties();
      props.setProperty('token_' + tok, JSON.stringify({ ts: Date.now(), token: tok }));
    }
    var callback = params.callback;
    if (callback) {
      return ContentService.createTextOutput(callback + '({ok:true});').setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  }

  // 2. Endpoint para pantalla de Bloqueado
  if (action === 'bloqueado') {
    var templateBloqueado = HtmlService.createTemplateFromFile('Bloqueado');
    return templateBloqueado.evaluate().setTitle('Acceso Bloqueado').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // 3. FLUJO PRINCIPAL: Cargar el Formulario para el alumno
  var token = params.t;
  var materia = params.m ? decodeURIComponent(params.m) : 'Materia';

  var template = HtmlService.createTemplateFromFile('FormularioHTML');
  template.materia = materia;
  template.token = token || '';
  template.latAula = CONFIG.LAT_AULA;
  template.lngAula = CONFIG.LNG_AULA;
  template.radioMetros = CONFIG.RADIO_METROS;

  return template.evaluate()
    .setTitle('Registro de Asistencia')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ==========================================
// OTRAS FUNCIONES AUXILIARES DEL SISTEMA
// ==========================================
function doPost(e) {
  var datos = JSON.parse(e.postData.contents);
  try {
    var sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.NOMBRE_HOJA);
    sheet.appendRow([
      new Date(),           
      datos.apellido,       
      datos.nombre,         
      datos.pc,             
      datos.llegada,        
      datos.observaciones   
    ]);
    SpreadsheetApp.flush();
  } catch(err) {}

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function registrarToken(token) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('token_' + token, JSON.stringify({ ts: Date.now(), token: token }));
  limpiarTokensVencidos(props);
}

function verificarToken(token) {
  if (!token) return false;
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('token_' + token);
  if (!raw) return false;
  try {
    var data = JSON.parse(raw);
    return (Date.now() - data.ts) / 1000 <= CONFIG.VALIDEZ_TOKEN_SEG;
  } catch (e) {
    return false;
  }
}

function limpiarTokensVencidos(props) {
  var keys = props.getKeys();
  var ahora = Date.now();
  keys.forEach(function(key) {
    if (!key.startsWith('token_')) return;
    try {
      var data = JSON.parse(props.getProperty(key));
      if ((ahora - data.ts) / 1000 > CONFIG.VALIDEZ_TOKEN_SEG * 2) {
        props.deleteProperty(key);
      }
    } catch (e) {
      props.deleteProperty(key);
    }
  });
}

function calcularDistanciaMetros(lat1, lng1, lat2, lng2) {
  var R = 6371000;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function guardarAsistencia(datos) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var hoja = ss.getSheetByName(CONFIG.NOMBRE_HOJA);
  if (!hoja) {
    hoja = ss.insertSheet(CONFIG.NOMBRE_HOJA);
    hoja.appendRow(['Timestamp','Nombre','Apellido','Email','Materia','Lat','Lng','Distancia (m)']);
    hoja.getRange(1,1,1,8).setFontWeight('bold');
    hoja.setFrozenRows(1);
  }
  hoja.appendRow([
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss'),
    datos.nombre, datos.apellido, datos.email,
    datos.materia || '—', datos.lat, datos.lng, Math.round(datos.distancia)
  ]);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
