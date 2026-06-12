// ==========================================
// CONFIGURACIÓN GLOBAL DEL SISTEMA
// ==========================================
var CONFIG = {
  SPREADSHEET_ID: '1s16g204YIKCDSF3kk76rjTZ8nPmwgrRJFpzILlKNakQ',
  NOMBRE_HOJA: 'Ruben Arias',
  LAT_AULA: -34.620828,  // 📍 Coordenadas de la escuela
  LNG_AULA: -58.516815, 
  RADIO_METROS: 500,     
  VALIDEZ_TOKEN_SEG: 300 // 5 minutos de validez máxima para el QR
};

// ==========================================
// FUNCIÓN PRINCIPAL (PETICIONES GET)
// ==========================================
function doGet(e) {
  var params = e.parameter;
  var action = params.action || params.accion || 'formulario';

  // ─── ACCIÓN 1: VERIFICAR SI EL ALUMNO YA FIRMÓ HOY ───
  if (action === 'verificar_duplicado') {
    var emailAlumno = (params.email || '').trim().toLowerCase();
    var yaExiste = "No";
    
    try {
      var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      var sheet = ss.getSheetByName(CONFIG.NOMBRE_HOJA);
      if (sheet) {
        var data = sheet.getDataRange().getValues();
        var hoyString = new Date().toDateString();
        
        for (var i = 1; i < data.length; i++) {
          var filaEmail = (data[i][6] || '').toString().trim().toLowerCase(); 
          var filaFecha = data[i][0]; 
          
          if (filaEmail === emailAlumno && filaFecha instanceof Date) {
            if (filaFecha.toDateString() === hoyString) {
              yaExiste = "SÍ";
              break;
            }
          }
        }
      }
    } catch(err) {}
    
    var callback = params.callback;
    if (callback) {
      return ContentService.createTextOutput(callback + '({duplicado:"' + yaExiste + '"});')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(JSON.stringify({ duplicado: yaExiste })).setMimeType(ContentService.MimeType.JSON);
  }

  // ─── ACCIÓN 2: REGISTRAR ASISTENCIA (CON FILSTRO ESTRICTO DE QR) ───
  if (action === 'registrar_asistencia') {
    try {
      var tokenAlumno = (params.token_alumno || '').trim();
      
      // CONTROL ANTITRAMPAS: Si el token no coincide con el QR activo en el engranaje, rebota
      if (!tokenAlumno || !verificarToken(tokenAlumno)) {
        var callback = params.callback;
        if (callback) {
          return ContentService.createTextOutput(callback + '({ok:false, error:"TOKEN_VENCIDO"});')
            .setMimeType(ContentService.MimeType.JAVASCRIPT);
        }
        return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "TOKEN_VENCIDO" })).setMimeType(ContentService.MimeType.JSON);
      }

      var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      var sheet = ss.getSheetByName(CONFIG.NOMBRE_HOJA); 
      if (!sheet) throw new Error("No se encontró la solapa");

      var emailAlumno = (params.email || '').trim().toLowerCase();
      var marcaDuplicado = "No"; 

      if (emailAlumno !== '') {
        var data = sheet.getDataRange().getValues();
        var hoyString = new Date().toDateString(); 
        
        for (var i = 1; i < data.length; i++) {
          var filaEmail = (data[i][6] || '').toString().trim().toLowerCase(); 
          var filaFecha = data[i][0]; 
          
          if (filaEmail === emailAlumno && filaFecha instanceof Date) {
            if (filaFecha.toDateString() === hoyString) {
              marcaDuplicado = "SÍ (Duplicado)"; 
              break; 
            }
          }
        }
      }
      
      // Inserción en la planilla
      sheet.appendRow([
        new Date(),                  
        params.apellido || '',       
        params.nombre || '',         
        params.pc || '',             
        params.llegada || '',        
        params.observaciones || '',  
        emailAlumno,                 
        marcaDuplicado               
      ]);
      
      SpreadsheetApp.flush();

    } catch(err) {
      Logger.log("Error al registrar: " + err.message);
    }

    var callback = params.callback;
    if (callback) {
      return ContentService.createTextOutput(callback + '({ok:true});')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  }

  // ─── ACCIÓN 3: RECIBIR EL NUEVO TOKEN GENERADO POR EL PANEL DOCENTE ───
  if (action === 'registrar_token') {
    var tok = params.t;
    if (tok) {
      var props = PropertiesService.getScriptProperties();
      // Pisamos los valores fijos del engranaje en tiempo real
      props.setProperty('QR_ACTIVO_TOKEN', tok);
      props.setProperty('QR_ACTIVO_TIMESTAMP', Date.now().toString());
    }
    
    var callback = params.callback;
    if (callback) {
      return ContentService.createTextOutput(callback + '({ok:true});')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  }

  // ─── FLUJO POR DEFECTO: MUESTRA EL FORMULARIO HTML AL ALUMNO ───
  var template = HtmlService.createTemplateFromFile('FormularioHTML');
  template.materia = params.m ? decodeURIComponent(params.m) : 'Desarrollo de Software';
  template.token = params.t || '';
  template.latAula = CONFIG.LAT_AULA;
  template.lngAula = CONFIG.LNG_AULA;
  template.radioMetros = CONFIG.RADIO_METROS;

  return template.evaluate()
    .setTitle('Registro de Asistencia')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// VALIDACIÓN INTERNA CONTRA EL ENGRANAJE
// ==========================================
function verificarToken(tokenEnviado) {
  if (!tokenEnviado) return false;
  
  var props = PropertiesService.getScriptProperties();
  var tokenRealEnPantalla = props.getProperty('QR_ACTIVO_TOKEN');
  var timestampPantalla = props.getProperty('QR_ACTIVO_TIMESTAMP');
  
  if (!tokenRealEnPantalla || !timestampPantalla) return false;
  
  // Si el token del alumno no coincide exactamente con el del proyector, se corta acá
  if (tokenEnviado !== tokenRealEnPantalla) return false; 
  
  try {
    var transcurrido = (Date.now() - parseInt(timestampPantalla, 10)) / 1000;
    return transcurrido <= CONFIG.VALIDEZ_TOKEN_SEG; 
  } catch (e) {
    return false;
  }
}

// ==========================================
// 🧹 FUNCIÓN BARRENDERA (Para ejecutar desde el editor)
// ==========================================
function limpiarBasuraVieja() {
  var props = PropertiesService.getScriptProperties();
  var todas = props.getProperties();
  var contador = 0;
  
  for (var clave in todas) {
    // Si la propiedad empieza con el formato viejo "token_", la vuela
    if (clave.indexOf('token_') === 0) {
      props.deleteProperty(clave);
      contador++;
    }
  }
  Logger.log("¡Limpieza completada! Se eliminaron " + contador + " tokens fantasmas.");
}
