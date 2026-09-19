import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, query, where, getDocs, serverTimestamp, deleteField, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyCyzE_spj6e0VASt5FP50_5m2Ya-GJloM4", authDomain: "registro-bionetrico.firebaseapp.com", projectId: "registro-bionetrico" };
const app = initializeApp(firebaseConfig); 
const db = getFirestore(app);

const hoyStr = new Date().toLocaleDateString('sv-SE');
let timerEnVivo = null, empleadosEnAlmuerzo = [], registrosAlmGlobales = [], empleadosAlmDb = {}, personalBioGlobal = [];
let idDocumentoFirebase = null, horaEntradaGuardada = null;
let timerAlmuerzoEmpleado = null;

// Variable global para recordar si usamos TOKEN o QR
window.modoAlmuerzoGlobal = 'TOKEN'; 

// ==========================================================================
//   1. FUNCIONES DE UTILIDAD GLOBALES
// ==========================================================================
window.cerrarModal = function(id) { document.getElementById(id).style.display = 'none'; };

window.mostrarAlertaCustom = function(mensaje, tipo = 'warning') {
    const content = document.querySelector('#modal-alerta .modal-caja');
    const titulo = document.getElementById('alerta-titulo');
    if(tipo === 'error') { content.style.borderTopColor = 'var(--danger)'; titulo.style.color = 'var(--danger)'; titulo.innerHTML = '<i class="fas fa-times-circle"></i> Error'; } 
    else if(tipo === 'success') { content.style.borderTopColor = 'var(--success)'; titulo.style.color = 'var(--success)'; titulo.innerHTML = '<i class="fas fa-check-circle"></i> Éxito'; } 
    else { content.style.borderTopColor = 'var(--warning)'; titulo.style.color = 'var(--warning)'; titulo.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Atención'; }
    document.getElementById('alerta-mensaje').innerText = mensaje;
    document.getElementById('modal-alerta').style.display = 'flex';
};

window.mostrarConfirmacionCustom = function(mensaje, callback, isDanger = false) {
    document.getElementById('confirmacion-mensaje').innerText = mensaje;
    document.getElementById('modal-confirmacion').style.display = 'flex';
    const content = document.querySelector('#modal-confirmacion .modal-caja');
    const btnConfirmar = document.getElementById('btn-confirmar-accion');
    const titulo = document.getElementById('confirmacion-titulo');
    
    if(isDanger) {
        btnConfirmar.className = 'btn-danger'; titulo.style.color = 'var(--danger)'; content.style.borderTopColor = 'var(--danger)';
        titulo.innerHTML = '<i class="fas fa-exclamation-circle"></i> Confirmar Acción';
    } else {
        btnConfirmar.className = 'btn-primary'; titulo.style.color = 'var(--nava-cyan)'; content.style.borderTopColor = 'var(--nava-cyan)';
        titulo.innerHTML = '<i class="fas fa-question-circle"></i> Confirmar Acción';
    }
    btnConfirmar.onclick = function() { cerrarModal('modal-confirmacion'); callback(); };
};

function parseFechaExcel(fechaStr) {
    if (!fechaStr) return "";
    if (typeof fechaStr === 'string') {
        if (fechaStr.includes('-')) { const p = fechaStr.split('-'); return new Date(p[0], p[1] - 1, p[2]); } 
        else if (fechaStr.includes('/')) { const p = fechaStr.split('/'); return new Date(p[2], p[1] - 1, p[0]); }
    }
    return fechaStr;
}

function formatoHorasMinutos(minutosTotales) {
    let m = Math.floor(minutosTotales);
    let h = Math.floor(m / 60);
    let restM = m % 60;
    if (h > 0) return `${h}h ${restM}m`;
    return `${restM} minutos`;
}

// ==========================================================================
//   2. ENRUTAMIENTO Y NAVEGACIÓN
// ==========================================================================
window.onload = function() { history.replaceState({ vista: 'inicio' }, "", window.location.pathname + window.location.search); };

window.navegar = function(vistaId, pushToHistory = true) {
    document.getElementById('pantalla-inicio').style.display = 'none';
    document.getElementById('app-container').style.display = 'flex'; 
    document.querySelectorAll('.view-section').forEach(v => v.style.display = 'none');
    document.getElementById(vistaId).style.display = 'flex';
    if (vistaId === 'view-admin' || vistaId === 'view-dashboard-empleado') document.getElementById('btn-volver-global').style.display = 'none';
    else document.getElementById('btn-volver-global').style.display = 'block';
    if (pushToHistory) history.pushState({ vista: vistaId }, "", `#${vistaId}`);
};

window.volverInicio = function(pushToHistory = true) {
    if(document.getElementById('view-asistencia').style.display === 'flex') { navegar('view-dashboard-empleado'); return; }
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('pantalla-inicio').style.display = 'flex';
    if (pushToHistory) history.pushState({ vista: 'inicio' }, "", window.location.pathname + window.location.search);
};

window.addEventListener('popstate', (event) => {
    if (event.state && event.state.vista && event.state.vista !== 'inicio') navegar(event.state.vista, false);
    else { document.getElementById('app-container').style.display = 'none'; document.getElementById('pantalla-inicio').style.display = 'flex'; }
});

// ==========================================================================
//   3. SEGURIDAD PANEL ADMIN
// ==========================================================================
window.abrirModalAuth = function() { document.getElementById('modal-auth-admin').style.display = 'flex'; document.getElementById('admin-password-input').value = ""; };

window.validarAdmin = async function() {
    const pass = document.getElementById('admin-password-input').value;
    if(!pass) return mostrarAlertaCustom("Ingrese la contraseña.", "warning");
    const snap = await getDoc(doc(db, "configuracion", "seguridad"));
    if (snap.exists() && snap.data().adminPassword === pass) {
        cerrarModal('modal-auth-admin'); navegar('view-admin'); 
        inicializarDashboardAlmuerzos(); inicializarDashboardAsistencia();
    } else { mostrarAlertaCustom("Contraseña incorrecta.", "error"); }
};

window.abrirModalCambiarPassword = function() { document.getElementById('modal-cambiar-password').style.display = 'flex'; document.getElementById('new-password-input').value = ""; };

window.guardarNuevaPassword = async function() {
    const nueva = document.getElementById('new-password-input').value;
    if(!nueva || nueva.length < 4) return mostrarAlertaCustom("La contraseña debe tener al menos 4 caracteres.", "warning");
    try { await updateDoc(doc(db, "configuracion", "seguridad"), { adminPassword: nueva }); mostrarAlertaCustom("Contraseña actualizada con éxito.", "success"); cerrarModal('modal-cambiar-password');
    } catch (e) { mostrarAlertaCustom("Error al actualizar la contraseña.", "error"); }
};

window.switchAdminTab = function(tabName) {
    document.querySelectorAll('.admin-tab').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).style.display = 'block';
    document.getElementById(`nav-${tabName}`).classList.add('active');
    
    const title = document.getElementById('admin-module-title');
    if(tabName === 'almuerzos') title.innerHTML = '<i class="fas fa-utensils"></i> Gestión de Almuerzos';
    else { title.innerHTML = '<i class="fas fa-fingerprint"></i> Gestión de Asistencia'; actualizarListasEnVivoAsistencia(); }
};

// ==========================================================================
//   4. LOGIN Y SESIÓN DE EMPLEADOS
// ==========================================================================
window.loginEmpleado = async function() {
    const inputCedula = document.getElementById('login-cedula').value.trim();
    if(!inputCedula) return mostrarAlertaCustom("Por favor, ingrese su número de cédula.", "warning");

    const btn = document.querySelector('button[onclick="loginEmpleado()"]');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';

    try {
        let empleadoEncontrado = false; let datos = {};

        const refEmpleado = doc(db, "personal", inputCedula);
        const snap = await getDoc(refEmpleado);

        if(snap.exists()) {
            datos = snap.data(); empleadoEncontrado = true;
        } else {
            const snapConfig = await getDoc(doc(db, "configuracion", "empleados"));
            if (snapConfig.exists()) {
                const mapCedulas = snapConfig.data().cedulas || {};
                for (const [nombreEmp, cedulaEmp] of Object.entries(mapCedulas)) {
                    if (cedulaEmp === inputCedula) {
                        datos = { nombre: nombreEmp, ciudad: "No registrada", horaIngreso: "07:30" };
                        empleadoEncontrado = true; break; 
                    }
                }
            }
        }

        if(empleadoEncontrado) {
            document.getElementById('dash-nombre-empleado').innerText = datos.nombre;
            document.getElementById('cedula').value = inputCedula; 
            document.getElementById('txt-nombre').innerText = datos.nombre;
            document.getElementById('txt-cedula').innerText = inputCedula;
            document.getElementById('txt-ciudad').innerText = datos.ciudad || "No registrada";
            document.getElementById('txt-horario-asignado').innerText = datos.horaIngreso || "07:30";
            
            document.getElementById('info-registros').style.display = "none";
            document.getElementById('datos-salida').style.display = "none";
            document.getElementById('caja-atraso').style.display = "none";
            document.getElementById('caja-extras').style.display = "none";
            document.getElementById('btn-entrada').style.display = "block";
            document.getElementById('btn-entrada').disabled = false;
            document.getElementById('btn-salida-bio').style.display = "none";
            document.getElementById('btn-salida-bio').disabled = false;

            document.getElementById('login-cedula').value = "";
            navegar('view-dashboard-empleado');
            verificarEstadoAlmuerzoEmpleado(datos.nombre);
        } else { mostrarAlertaCustom("Cédula no encontrada.", "error"); }
    } catch (error) { mostrarAlertaCustom("Error de conexión.", "error"); }
    
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Acceder';
};

window.cerrarSesionEmpleado = function() {
    if(timerAlmuerzoEmpleado) clearInterval(timerAlmuerzoEmpleado);
    document.getElementById('dash-nombre-empleado').innerText = "NOMBRE";
    document.getElementById('cedula').value = "";
    volverInicio();
};

// ==========================================================================
//   5. SISTEMA DE ALMUERZO (ESTADO DEL EMPLEADO)
// ==========================================================================
window.verificarEstadoAlmuerzoEmpleado = async function(nombre) {
    const contenedor = document.getElementById('contenedor-almuerzo-empleado');
    contenedor.innerHTML = '<p style="color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Cargando estado...</p>';
    if(timerAlmuerzoEmpleado) clearInterval(timerAlmuerzoEmpleado);

    try {
        // Consultar el modo de almuerzo (Token o QR) elegido por el Admin
        const snapAjustes = await getDoc(doc(db, "configuracion", "ajustes_sistema"));
        if(snapAjustes.exists()) window.modoAlmuerzoGlobal = snapAjustes.data().modo_almuerzo || 'TOKEN';

        const ref = doc(db, "registros", nombre + "_" + hoyStr);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
            // El empleado no ha salido a almorzar
            contenedor.innerHTML = `<button class="btn-menu" style="border-color: var(--warning); color: var(--warning); width: 100%;" onclick="iniciarProcesoAlmuerzo('SALIDA')"><i class="fas fa-utensils"></i> REGISTRAR SALIDA ALMUERZO</button>`;
        } else {
            const d = snap.data();
            if (d.salida && !d.regreso) {
                // El empleado está en su hora de almuerzo (Muestra cronómetro)
                const salidaMs = d.salida.seconds * 1000;
                const horaSalidaText = new Date(salidaMs).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                
                contenedor.innerHTML = `
                    <div style="background: rgba(0,0,0,0.4); padding: 20px; border-radius: 12px; border-left: 3px solid var(--warning); text-align: center; margin-bottom: 15px;">
                        <p style="color: var(--text-muted); font-size: 12px; margin-bottom: 5px; text-transform: uppercase;">Hora de Salida</p>
                        <p style="color: var(--text-main); font-size: 16px; font-weight: bold; margin-bottom: 15px;"><i class="fas fa-clock" style="color:var(--warning);"></i> ${horaSalidaText}</p>
                        
                        <p id="lbl-tiempo-crono" style="color: var(--text-muted); font-size: 12px; margin-bottom: 5px; text-transform: uppercase;">Tiempo Restante</p>
                        <div id="crono-empleado" style="font-size: 38px; font-weight: 800; color: var(--warning); font-variant-numeric: tabular-nums; margin-bottom: 20px; text-shadow: 0 0 15px rgba(245,158,11,0.3);">60:00</div>
                        
                        <button class="btn-primary" style="width: 100%; background: linear-gradient(90deg, #f59e0b 0%, #d97706 100%); font-size: 14px;" onclick="iniciarProcesoAlmuerzo('RETORNO')"><i class="fas fa-walking"></i> MARCAR REGRESO</button>
                    </div>`;

                // Cronómetro
                timerAlmuerzoEmpleado = setInterval(() => {
                    const diffMs = Date.now() - salidaMs;
                    const restanteMs = (60 * 60 * 1000) - diffMs;
                    const isExcedido = restanteMs < 0;
                    const absRestante = Math.abs(restanteMs);

                    const totalSegundos = Math.floor(absRestante / 1000);
                    const minutos = Math.floor(totalSegundos / 60);
                    const segundos = totalSegundos % 60;
                    
                    const cronoEl = document.getElementById('crono-empleado');
                    const lblCrono = document.getElementById('lbl-tiempo-crono');
                    
                    if(cronoEl && lblCrono) {
                        const sign = isExcedido ? "-" : "";
                        cronoEl.innerText = `${sign}${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;
                        
                        if(isExcedido) {
                            cronoEl.style.color = 'var(--danger)'; cronoEl.style.textShadow = '0 0 15px rgba(255,23,68,0.5)';
                            lblCrono.innerText = "TIEMPO EXCEDIDO"; lblCrono.style.color = 'var(--danger)';
                        } else {
                            cronoEl.style.color = 'var(--warning)'; cronoEl.style.textShadow = '0 0 15px rgba(245,158,11,0.3)';
                            lblCrono.innerText = "TIEMPO RESTANTE"; lblCrono.style.color = 'var(--text-muted)';
                        }
                    }
                }, 1000);

            } else if (d.salida && d.regreso) {
                // Almuerzo completado (Muestra resumen)
                const salidaMs = d.salida.seconds * 1000; const regresoMs = d.regreso.seconds * 1000;
                const horaSalidaText = new Date(salidaMs).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                const horaRegresoText = new Date(regresoMs).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                const usadoMin = Math.floor((regresoMs - salidaMs) / 60000);
                
                let atrasoHtml = "";
                if(usadoMin > 60) {
                    atrasoHtml = `<p style="color: var(--danger); font-size: 13px; font-weight: bold; margin-top: 15px; background: rgba(255,23,68,0.1); padding: 10px; border-radius: 6px; text-align:center;"><i class="fas fa-exclamation-triangle"></i> Atraso: ${formatoHorasMinutos(usadoMin - 60)}</p>`;
                } else {
                    atrasoHtml = `<p style="color: var(--success); font-size: 13px; font-weight: bold; margin-top: 15px; background: rgba(0,230,118,0.1); padding: 10px; border-radius: 6px; text-align:center;"><i class="fas fa-check-circle"></i> Llegada a tiempo</p>`;
                }

                contenedor.innerHTML = `
                    <div style="background: rgba(0,0,0,0.4); padding: 20px; border-radius: 12px; border-left: 3px solid var(--success); text-align: left;">
                        <h4 style="color: var(--success); margin-bottom: 15px; text-align: center; text-transform: uppercase; font-size: 13px;"><i class="fas fa-check-double"></i> Almuerzo Completado</h4>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><span style="color: var(--text-muted);">Hora Salida:</span><span style="color: var(--text-main); font-weight: 600;">${horaSalidaText}</span></div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><span style="color: var(--text-muted);">Hora Regreso:</span><span style="color: var(--text-main); font-weight: 600;">${horaRegresoText}</span></div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 12px; margin-top: 12px;">
                            <span style="color: var(--text-muted);">Tiempo Total Tomado:</span><span style="color: var(--nava-cyan); font-weight: bold;">${formatoHorasMinutos(usadoMin)}</span>
                        </div>
                        ${atrasoHtml}
                    </div>`;
            }
        }
    } catch (error) { contenedor.innerHTML = '<p style="color:var(--danger);">Error al cargar estado.</p>'; }
};

// ==========================================================================
//   5.1 LÓGICA DEL SISTEMA DUAL (TOKENS Y QR)
// ==========================================================================

/* Enrutador principal: Decide qué pantalla abrir según la elección del Admin */
window.iniciarProcesoAlmuerzo = function(tipo) {
    if(window.modoAlmuerzoGlobal === 'QR') {
        abrirEscanerQR(tipo); // Activa la cámara del empleado
    } else {
        abrirModalToken(tipo); // Pide el Token tradicional
    }
};

/* --- MÉTODO 1: VALIDACIÓN POR TOKEN (Clásico) --- */
window.abrirModalToken = function(tipo) {
    window.estadoAlmuerzoActual = tipo; 
    const titulo = document.getElementById('titulo-token-almuerzo'); const desc = document.getElementById('desc-token-almuerzo'); const btnValidar = document.getElementById('btn-validar-token');
    document.getElementById('input-token-almuerzo').value = "";

    if(tipo === 'SALIDA') {
        titulo.innerHTML = '<i class="fas fa-utensils"></i> Registrar Salida'; desc.innerText = "Ingrese el token de 6 dígitos de la pantalla principal para iniciar su almuerzo."; btnValidar.innerHTML = '<i class="fas fa-check"></i> Validar Salida';
    } else {
        titulo.innerHTML = '<i class="fas fa-walking"></i> Registrar Retorno'; desc.innerText = "Ingrese el token de 6 dígitos para registrar su regreso."; btnValidar.innerHTML = '<i class="fas fa-check"></i> Validar Retorno';
    }
    document.getElementById('modal-token-almuerzo').style.display = 'flex';
};

window.validarTokenYRegistrar = async function() {
    const inputToken = document.getElementById('input-token-almuerzo').value.trim();
    if(!inputToken) return mostrarAlertaCustom("Por favor, ingrese el token.", "warning");
    if(inputToken.length !== 6) return mostrarAlertaCustom("El token debe tener 6 dígitos exactos.", "warning");

    const btn = document.getElementById('btn-validar-token'); const btnOriginalText = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Validando...';

    try {
        const tokenSnap = await getDoc(doc(db, "configuracion", "token_seguridad"));
        if(!tokenSnap.exists() || tokenSnap.data().valor !== inputToken) {
            mostrarAlertaCustom("Token incorrecto o caducado. Revise la pantalla de la oficina e intente de nuevo.", "error");
            btn.disabled = false; btn.innerHTML = btnOriginalText; return;
        }

        const nombre = document.getElementById('dash-nombre-empleado').innerText; const cedula = document.getElementById('cedula').value; const ref = doc(db, "registros", nombre + "_" + hoyStr);

        if (window.estadoAlmuerzoActual === "SALIDA") {
            await setDoc(ref, { nombre: nombre, fecha: hoyStr, salida: serverTimestamp(), regreso: null, cedula: cedula });
            mostrarAlertaCustom("¡Salida registrada! Buen provecho.", "success");
        } else if (window.estadoAlmuerzoActual === "RETORNO") {
            await updateDoc(ref, { regreso: serverTimestamp() });
            mostrarAlertaCustom("¡Retorno registrado con éxito!", "success");
        }
        cerrarModal('modal-token-almuerzo'); verificarEstadoAlmuerzoEmpleado(nombre);
    } catch (error) { mostrarAlertaCustom("Error de conexión.", "error"); }
    btn.disabled = false; btn.innerHTML = btnOriginalText;
};

/* --- MÉTODO 2: VALIDACIÓN POR QR (Escáner del Empleado) --- */
let escanerActivo = null;

window.abrirEscanerQR = function(tipo) {
    window.estadoAlmuerzoActual = tipo; // Guardamos si es SALIDA o RETORNO
    document.getElementById('lbl-tipo-escaner').innerText = tipo;
    document.getElementById('modal-escaner-qr').style.display = 'flex';
    
    // Iniciar la librería de cámara en el contenedor div
    escanerActivo = new Html5Qrcode("lector-camara-qr");
    const configEscaner = { fps: 10, qrbox: { width: 250, height: 250 } };
    
    // facingMode environment es para usar la cámara trasera por defecto
    escanerActivo.start({ facingMode: "environment" }, configEscaner, onEscaneoExitoso)
    .catch((err) => {
        mostrarAlertaCustom("No se pudo iniciar la cámara. Verifica los permisos del navegador.", "error");
    });
};

window.cerrarEscanerQR = function() {
    if(escanerActivo) {
        escanerActivo.stop().then(() => {
            escanerActivo.clear();
        }).catch(err => console.log(err));
    }
    cerrarModal('modal-escaner-qr');
};

/* Disparador automático cuando la cámara lee el QR exitosamente */
async function onEscaneoExitoso(textoEscaneado, decodificado) {
    // 1. Apagar cámara para evitar doble lectura
    if(escanerActivo) {
        await escanerActivo.stop();
        escanerActivo.clear();
    }
    document.getElementById('modal-escaner-qr').style.display = 'none';
    
    // 2. Verificar la carga de seguridad (que el QR sea el de HOY)
    const payloadEsperado = "ITSACOURIER-ALMUERZO-" + hoyStr;
    
    if (textoEscaneado !== payloadEsperado) {
        mostrarAlertaCustom("Código QR inválido o caducado. Asegúrate de escanear el papel del día de hoy.", "error");
        return;
    }
    
    // 3. Procesar el registro en la base de datos
    try {
        const nombre = document.getElementById('dash-nombre-empleado').innerText; 
        const cedula = document.getElementById('cedula').value; 
        const ref = doc(db, "registros", nombre + "_" + hoyStr);

        if (window.estadoAlmuerzoActual === "SALIDA") {
            await setDoc(ref, { nombre: nombre, fecha: hoyStr, salida: serverTimestamp(), regreso: null, cedula: cedula });
            mostrarAlertaCustom("¡Salida registrada mediante QR! Buen provecho.", "success");
        } else if (window.estadoAlmuerzoActual === "RETORNO") {
            await updateDoc(ref, { regreso: serverTimestamp() });
            mostrarAlertaCustom("¡Retorno registrado mediante QR con éxito!", "success");
        }
        verificarEstadoAlmuerzoEmpleado(nombre); // Recargar cronómetro
    } catch (error) { 
        mostrarAlertaCustom("Error de conexión al guardar el registro.", "error"); 
    }
}

// ==========================================================================
//   6. ASISTENCIA BIOMÉTRICA EXACTA (GPS)
// ==========================================================================
async function obtenerHoraDeLaWeb() {
    try {
        const respuesta = await fetch('https://timeapi.io/api/Time/current/zone?timeZone=America/Guayaquil');
        if (!respuesta.ok) throw new Error("Fallo en servidor");
        const datos = await respuesta.json(); return new Date(datos.dateTime);
    } catch (error) { return null; }
}

function milisegundosATexto(ms) { return formatoHorasMinutos(ms / 60000); }

function obtenerUbicacion() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) resolve("No soportado");
        navigator.geolocation.getCurrentPosition(
            (posicion) => resolve(`<a href="https://www.google.com/maps?q=${posicion.coords.latitude},${posicion.coords.longitude}" target="_blank" style="color:var(--nava-cyan);"><i class="fas fa-map-marker-alt"></i> Ver Mapa</a>`),
            (error) => resolve("Sin GPS"), { enableHighAccuracy: true }
        );
    });
}

window.procesarMarcacion = async function(tipo) {
    const cedulaValor = document.getElementById('cedula').value.trim();
    if (cedulaValor === "") return mostrarAlertaCustom("Error de sesión. Vuelva a iniciar sesión.", "error");
    
    const botonActivo = tipo === 'entrada' ? 'btn-entrada' : 'btn-salida-bio';
    document.getElementById(botonActivo).disabled = true;

    try {
        const refEmpleado = doc(db, "personal", cedulaValor);
        const snapEmpleado = await getDoc(refEmpleado);

        if (!snapEmpleado.exists()) {
            mostrarAlertaCustom("No estás habilitado para el control de asistencia.", "warning");
            document.getElementById(botonActivo).disabled = false; return;
        }

        const datosEmpleado = snapEmpleado.data();
        const horaAsignadaStr = datosEmpleado.horaIngreso || "07:30";
        const [hIng, mIng] = horaAsignadaStr.split(':').map(Number);
        
        const horaSistema = await obtenerHoraDeLaWeb();
        if (!horaSistema) { document.getElementById(botonActivo).disabled = false; mostrarAlertaCustom("Error de internet.", "error"); return; }

        const horaFormateada = horaSistema.toLocaleTimeString('es-ES', { hour: '2-digit', minute:'2-digit', second:'2-digit' });
        const fechaCorta = String(horaSistema.getDate()).padStart(2, '0') + "/" + String(horaSistema.getMonth() + 1).padStart(2, '0') + "/" + horaSistema.getFullYear();

        const consulta = query(collection(db, "marcaciones"), where("cedula", "==", cedulaValor), where("fecha", "==", fechaCorta));
        const resultadosConsulta = await getDocs(consulta);
        
        let registroExistente = null; let idDocExistente = null;
        resultadosConsulta.forEach((docSnap) => { registroExistente = docSnap.data(); idDocExistente = docSnap.id; });

        if (registroExistente && registroExistente.horaSalida) {
            mostrarAlertaCustom(`Estimado/a ${datosEmpleado.nombre}, ya marcaste tu entrada y salida el día de hoy.`, "warning");
            document.getElementById('txt-hora-entrada').innerText = registroExistente.horaEntrada; 
            document.getElementById('txt-hora-salida').innerText = registroExistente.horaSalida;
            if (registroExistente.atraso && registroExistente.atraso !== "A tiempo") {
                document.getElementById('txt-atraso').innerText = registroExistente.atraso; document.getElementById('caja-atraso').style.display = "block";
            }
            document.getElementById('txt-ubicacion-entrada').innerHTML = registroExistente.enlaceGoogleMapsEntrada || "Sin mapa"; 
            document.getElementById('txt-ubicacion-salida').innerHTML = registroExistente.enlaceGoogleMapsSalida || "Sin mapa";
            if (registroExistente.tiempoTrabajado) document.getElementById('txt-trabajado').innerText = registroExistente.tiempoTrabajado;
            if (registroExistente.horasExtras && registroExistente.horasExtras !== "Ninguna") {
                document.getElementById('txt-extras').innerText = registroExistente.horasExtras; document.getElementById('caja-extras').style.display = "block";
            }
            document.getElementById('info-registros').style.display = "block"; document.getElementById('datos-salida').style.display = "block";
            document.getElementById('btn-entrada').style.display = "none"; document.getElementById('btn-salida-bio').style.display = "none";
            return; 
        }

        if (tipo === 'entrada') {
            if (registroExistente) {
                mostrarAlertaCustom(`Ya tienes una entrada registrada. Por favor marca solo tu salida.`, "warning");
                document.getElementById('txt-hora-entrada').innerText = registroExistente.horaEntrada;
                if (registroExistente.atraso && registroExistente.atraso !== "A tiempo") {
                    document.getElementById('txt-atraso').innerText = registroExistente.atraso; document.getElementById('caja-atraso').style.display = "block";
                }
                document.getElementById('txt-ubicacion-entrada').innerHTML = registroExistente.enlaceGoogleMapsEntrada || "Sin mapa";
                document.getElementById('info-registros').style.display = "block"; 
                document.getElementById('btn-entrada').style.display = "none"; document.getElementById('btn-salida-bio').style.display = "block"; document.getElementById('btn-salida-bio').disabled = false;
                idDocumentoFirebase = idDocExistente;
                if (registroExistente.tiempoEntradaMs) horaEntradaGuardada = new Date(registroExistente.tiempoEntradaMs);
                return; 
            }
        } else if (tipo === 'salida') {
            if (!registroExistente) {
                mostrarAlertaCustom("No tienes una entrada registrada el día de hoy.", "warning"); 
                document.getElementById('btn-salida-bio').disabled = false; return;
            }
            idDocumentoFirebase = idDocExistente;
            if (registroExistente.tiempoEntradaMs) horaEntradaGuardada = new Date(registroExistente.tiempoEntradaMs);
            if (registroExistente.atraso && registroExistente.atraso !== "A tiempo") {
                document.getElementById('txt-atraso').innerText = registroExistente.atraso; document.getElementById('caja-atraso').style.display = "block";
            }
            document.getElementById('txt-ubicacion-entrada').innerHTML = registroExistente.enlaceGoogleMapsEntrada || "Sin mapa";
            document.getElementById('txt-hora-entrada').innerText = registroExistente.horaEntrada;
        }

        document.getElementById('txt-ubicacion-' + tipo).innerText = "Obteniendo GPS...";
        const enlaceUbicacion = await obtenerUbicacion();
        document.getElementById('info-registros').style.display = "block";

        if (tipo === 'entrada') {
            horaEntradaGuardada = horaSistema;
            document.getElementById('txt-hora-entrada').innerText = horaFormateada;
            document.getElementById('txt-ubicacion-entrada').innerHTML = enlaceUbicacion;
            
            let textoAtraso = "A tiempo";
            const limiteEntrada = new Date(horaSistema);
            limiteEntrada.setHours(hIng, mIng, 0, 0); 
            if (horaSistema > limiteEntrada) {
                textoAtraso = milisegundosATexto(horaSistema - limiteEntrada);
                document.getElementById('txt-atraso').innerText = textoAtraso; document.getElementById('caja-atraso').style.display = "block";
            }

            const nuevoRegistro = await addDoc(collection(db, "marcaciones"), {
                cedula: cedulaValor, nombre: datosEmpleado.nombre, ciudad: datosEmpleado.ciudad, fecha: fechaCorta,
                horaEntrada: horaFormateada, tiempoEntradaMs: horaSistema.getTime(), atraso: textoAtraso,
                ubicacionEntrada: enlaceUbicacion.replace(/<[^>]*>?/gm, 'Link Mapa'), enlaceGoogleMapsEntrada: enlaceUbicacion,
                estado: "Trabajando", horarioAsignado: horaAsignadaStr
            });
            
            idDocumentoFirebase = nuevoRegistro.id;
            document.getElementById('btn-entrada').style.display = "none"; document.getElementById('btn-salida-bio').style.display = "block"; document.getElementById('btn-salida-bio').disabled = false;
            mostrarAlertaCustom("¡Entrada registrada con éxito!", "success");

        } else if (tipo === 'salida') {
            document.getElementById('txt-hora-salida').innerText = horaFormateada;
            document.getElementById('txt-ubicacion-salida').innerHTML = enlaceUbicacion;
            document.getElementById('datos-salida').style.display = "block";

            let tiempoTrabajado = "Falta registro", horasExtras = "Ninguna";
            if (horaEntradaGuardada) {
                tiempoTrabajado = milisegundosATexto(horaSistema - horaEntradaGuardada);
                document.getElementById('txt-trabajado').innerText = tiempoTrabajado;
            }
            const limiteSalida = new Date(horaSistema); limiteSalida.setHours(hIng + 9, mIng, 0, 0);
            if (horaSistema > limiteSalida) {
                horasExtras = milisegundosATexto(horaSistema - limiteSalida);
                document.getElementById('txt-extras').innerText = horasExtras; document.getElementById('caja-extras').style.display = "block";
            }

            await updateDoc(doc(db, "marcaciones", idDocumentoFirebase), {
                horaSalida: horaFormateada, tiempoTrabajado: tiempoTrabajado, horasExtras: horasExtras,
                ubicacionSalida: enlaceUbicacion.replace(/<[^>]*>?/gm, 'Link Mapa'), enlaceGoogleMapsSalida: enlaceUbicacion, estado: "Turno Finalizado"
            });
            document.getElementById('btn-salida-bio').style.display = "none";
            mostrarAlertaCustom("¡Jornada finalizada exitosamente!", "success");
        }
    } catch (error) { mostrarAlertaCustom("Ocurrió un error al guardar los datos.", "error"); document.getElementById(botonActivo).disabled = false; }
};

// ==========================================================================
//   7. DASHBOARD ADMIN: ALMUERZOS Y CONTROL DE MODOS
// ==========================================================================

/* --- Selector de Modos en el Panel Admin --- */
window.cambiarModoAlmuerzoAdmin = async function() {
    const modoSeleccionado = document.getElementById('selector-modo-almuerzo').value;
    const btnToken = document.getElementById('btn-header-token');
    const btnQr = document.getElementById('btn-header-qr');
    
    if(modoSeleccionado === 'QR') {
        btnToken.style.display = 'none'; btnQr.style.display = 'block';
    } else {
        btnToken.style.display = 'block'; btnQr.style.display = 'none';
    }
    
    // Guardar preferencia general en Firebase para que los empleados la lean
    try {
        await setDoc(doc(db, "configuracion", "ajustes_sistema"), { modo_almuerzo: modoSeleccionado }, { merge: true });
        mostrarAlertaCustom(`Validación cambiada a modo: ${modoSeleccionado}.`, "success");
    } catch(e) { console.error(e); }
};

/* --- Ventana e Impresión del QR del Día --- */
let codigoQRGenerado = null;
window.abrirModalImprimirQR = function() {
    document.getElementById('modal-imprimir-qr').style.display = 'flex';
    document.getElementById('lbl-fecha-qr').innerText = hoyStr; 
    
    const contenedor = document.getElementById('contenedor-qr-imprimir');
    contenedor.innerHTML = ""; 
    const textoSecreto = "ITSACOURIER-ALMUERZO-" + hoyStr;
    
    codigoQRGenerado = new QRCode(contenedor, {
        text: textoSecreto, width: 250, height: 250,
        colorDark : "#000000", colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });
};

window.ejecutarImpresionQR = function() {
    const canvas = document.getElementById("contenedor-qr-imprimir").querySelector("canvas");
    if (canvas) {
        const imagenBase64 = canvas.toDataURL("image/png");
        let ventana = window.open('', '_blank', 'width=800,height=800');
        ventana.document.write(`
            <html>
                <head><title>QR Almuerzo ITSACOURIER</title></head>
                <body style="text-align: center; font-family: sans-serif; padding-top: 50px;">
                    <h1 style="font-size: 30px; margin-bottom: 5px;">CONTROL DE ALMUERZO</h1>
                    <p style="font-size: 18px; color: #555; margin-bottom: 30px;">Válido únicamente para la fecha: <strong>${hoyStr}</strong></p>
                    <img src="${imagenBase64}" style="width: 400px; height: 400px; border: 2px solid #000; padding: 20px; border-radius: 10px;" />
                    <p style="margin-top: 30px; font-weight: bold;">Escanea este código desde el portal ITSACOURIER con tu celular.</p>
                </body>
            </html>
        `);
        ventana.document.close();
        setTimeout(() => { ventana.focus(); ventana.print(); ventana.close(); cerrarModal('modal-imprimir-qr'); }, 500);
    }
};

function formatearHora(timestamp) { if (!timestamp || !timestamp.seconds) return "-"; return new Date(timestamp.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}); }
function calcularTiempo(salida, regreso) {
  if (!salida || !regreso) return { texto: "-", exceso: false };
  const diff = ((regreso.seconds * 1000) - (salida.seconds * 1000)) / 1000; 
  const minutos = Math.floor(diff / 60); 
  return { texto: formatoHorasMinutos(minutos), exceso: minutos > 60 };
}

window.inicializarDashboardAlmuerzos = async function() {
  const btns = document.querySelectorAll('button[onclick="inicializarDashboardAlmuerzos()"]');
  btns.forEach(b => { b.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...'; b.disabled = true; });

  // 1. Cargar el modo de validación elegido previamente por el admin (QR o Token)
  try {
      const snapAjustes = await getDoc(doc(db, "configuracion", "ajustes_sistema"));
      if(snapAjustes.exists() && snapAjustes.data().modo_almuerzo) {
          const modo = snapAjustes.data().modo_almuerzo;
          const selector = document.getElementById('selector-modo-almuerzo');
          if(selector) {
              selector.value = modo;
              if(modo === 'QR') { document.getElementById('btn-header-token').style.display = 'none'; document.getElementById('btn-header-qr').style.display = 'block'; } 
              else { document.getElementById('btn-header-token').style.display = 'block'; document.getElementById('btn-header-qr').style.display = 'none'; }
          }
      }
  } catch (e) { console.log("Configuración inicial de modo almuerzo no encontrada."); }

  // 2. Cargar listas de empleados
  const ref = doc(db, "configuracion", "empleados");
  const snap = await getDoc(ref);
  if (snap.exists()) empleadosAlmDb = snap.data(); else empleadosAlmDb = { PLAYA: [], FACTURACION: [], OFICINA: [] };
  cargarFiltroEmpleadosAlmuerzo(); 
  
  const querySnapshot = await getDocs(collection(db, "registros"));
  registrosAlmGlobales = []; querySnapshot.forEach(d => registrosAlmGlobales.push(d.data()));
  actualizarListasEnVivoAlmuerzo();

  btns.forEach(b => { b.innerHTML = '<i class="fas fa-sync-alt"></i> Actualizar'; b.disabled = false; });
};

function actualizarListasEnVivoAlmuerzo() {
  const listPendientes = document.getElementById("list-pendientes"); const listAlmuerzo = document.getElementById("list-almuerzo"); const listCompletados = document.getElementById("list-completados");
  let cPendientes = 0, cAlmuerzo = 0, cCompletados = 0; listPendientes.innerHTML = ""; listAlmuerzo.innerHTML = ""; listCompletados.innerHTML = ""; empleadosEnAlmuerzo = [];

  const todosRaw = [ ...(empleadosAlmDb.PLAYA||[]), ...(empleadosAlmDb.FACTURACION||[]), ...(empleadosAlmDb.OFICINA||[]) ];
  const todos = todosRaw.map(emp => typeof emp === 'object' ? emp.nombre : emp);
  
  todos.forEach(nombre => {
      const regHoy = registrosAlmGlobales.find(r => r.nombre === nombre && r.fecha === hoyStr);
      if (!regHoy) { listPendientes.innerHTML += `<li><span class="nombre">${nombre}</span></li>`; cPendientes++; } 
      else if (regHoy.salida && !regHoy.regreso) {
          const salidaMs = regHoy.salida.seconds * 1000;
          listAlmuerzo.innerHTML += `<li><span class="nombre">${nombre}</span> <span class="time-badge" id="timer-${nombre.replace(/\s/g, '')}">--:--</span></li>`;
          empleadosEnAlmuerzo.push({ nombre: nombre.replace(/\s/g, ''), salidaMs: salidaMs }); cAlmuerzo++;
      } 
      else if (regHoy.salida && regHoy.regreso) {
          const t = calcularTiempo(regHoy.salida, regHoy.regreso);
          listCompletados.innerHTML += `<li><span class="nombre">${nombre}</span><span style="font-size:12px; font-weight:700; color:${t.exceso ? 'var(--danger)' : 'var(--success)'};">${t.texto}</span></li>`; cCompletados++;
      }
  });

  document.getElementById("count-pendientes").innerText = cPendientes; document.getElementById("count-almuerzo").innerText = cAlmuerzo; document.getElementById("count-completados").innerText = cCompletados;
  if (timerEnVivo) clearInterval(timerEnVivo);
  actualizarRelojesAlmuerzo(); timerEnVivo = setInterval(actualizarRelojesAlmuerzo, 1000); 
}

function actualizarRelojesAlmuerzo() {
    empleadosEnAlmuerzo.forEach(emp => {
        const el = document.getElementById(`timer-${emp.nombre}`);
        if(el) {
            const diffMs = Date.now() - emp.salidaMs; 
            const restanteMs = (60 * 60 * 1000) - diffMs;
            const isExcedido = restanteMs < 0;
            const absRestante = Math.abs(restanteMs);

            const totalSegundos = Math.floor(absRestante / 1000);
            const minutos = Math.floor(totalSegundos / 60); 
            const segundos = totalSegundos % 60;
            const sign = isExcedido ? "-" : "";

            el.innerText = `${sign}${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;
            if (isExcedido) el.classList.add("excedido");
            else el.classList.remove("excedido");
        }
    });
}

window.cargarFiltroEmpleadosAlmuerzo = function() {
    const area = document.getElementById("buscar-area").value; const select = document.getElementById("buscar-nombre");
    select.innerHTML = '<option value="">-- Seleccionar --</option>';
    let listaRaw = area === "" ? [ ...(empleadosAlmDb.PLAYA||[]), ...(empleadosAlmDb.FACTURACION||[]), ...(empleadosAlmDb.OFICINA||[]) ] : empleadosAlmDb[area] || [];
    let lista = listaRaw.map(emp => typeof emp === 'object' ? emp.nombre : emp);
    lista.sort().forEach(n => select.innerHTML += `<option value="${n}">${n}</option>`);
};

window.buscarHistorialAlmuerzo = function() {
    const nombreBuscado = document.getElementById("buscar-nombre").value;
    if (!nombreBuscado) return mostrarAlertaCustom("Seleccione un empleado.", 'warning');
    const filtrados = registrosAlmGlobales.filter(r => r.nombre === nombreBuscado).sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
    const tablaRes = document.getElementById("tabla-resultados-almuerzo"); tablaRes.innerHTML = "";
    if (filtrados.length === 0) tablaRes.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Sin registros encontrados.</td></tr>`;
    else filtrados.forEach(d => { tablaRes.innerHTML += `<tr><td><strong>${d.nombre}</strong></td><td>${d.fecha}</td><td>${formatearHora(d.salida)}</td><td>${formatearHora(d.regreso)}</td><td><span class="${calcularTiempo(d.salida, d.regreso).exceso ? 'rojo' : 'verde'}">${calcularTiempo(d.salida, d.regreso).texto}</span></td></tr>`; });
    document.getElementById("contenedor-tabla-almuerzo").style.display = "block"; 
};
window.limpiarBusquedaAlmuerzo = function() { document.getElementById("buscar-area").value = ""; cargarFiltroEmpleadosAlmuerzo(); document.getElementById("buscar-nombre").value = ""; document.getElementById("contenedor-tabla-almuerzo").style.display = "none"; };

window.exportarAlmuerzos = async function () {
    const datosExportar = [];
    registrosAlmGlobales.forEach(d => { 
        const t = calcularTiempo(d.salida, d.regreso);
        let excedido = "A tiempo";
        if(t.exceso && d.salida && d.regreso) {
            const m = Math.floor(((d.regreso.seconds*1000)-(d.salida.seconds*1000))/60000);
            excedido = formatoHorasMinutos(m-60);
        }
        datosExportar.push({ "Fecha": parseFechaExcel(d.fecha), "Nombre": d.nombre, "Salida": formatearHora(d.salida), "Regreso": formatearHora(d.regreso), "Tiempo Usado": t.texto, "Tiempo Excedido": excedido }); 
    });
    if (datosExportar.length === 0) return mostrarAlertaCustom("No hay registros.", 'warning');
    const hoja = XLSX.utils.json_to_sheet(datosExportar, { cellDates: true }); 
    const libro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(libro, hoja, "Almuerzos"); XLSX.writeFile(libro, "Reporte_Almuerzos.xlsx");
};

async function refrescarAlmuerzos(mensajeExito) {
    try {
        const snap = await getDoc(doc(db, "configuracion", "empleados"));
        if (snap.exists()) empleadosAlmDb = snap.data();
    } catch (e) {
        mostrarAlertaCustom("Se guardó, pero no se pudo refrescar la lista. Vuelva a abrir Gestión de Personal.", 'warning');
        return;
    }
    const modal = document.getElementById('modal-gestion-almuerzos');
    if (modal && modal.style.display === 'flex') abrirModalAlmuerzos();
    if (document.getElementById('buscar-nombre')) cargarFiltroEmpleadosAlmuerzo();
    if (document.getElementById('list-pendientes')) actualizarListasEnVivoAlmuerzo();
    if (mensajeExito) mostrarAlertaCustom(mensajeExito, 'success');
}

window.abrirModalAlmuerzos = function() {
    document.getElementById('modal-gestion-almuerzos').style.display = 'flex'; 
    const grid = document.getElementById("grid-empleados-alm"); grid.innerHTML = "";
    const mapCedulas = empleadosAlmDb.cedulas || {};
    
    for (const area of ["PLAYA", "FACTURACION", "OFICINA"]) {
        let htmlArea = `<div class="area-card"><div class="area-header">${area === "FACTURACION" ? "FACTURACIÓN" : area}</div><ul class="area-list" ondragover="allowDrop(event, this)" ondragleave="dragLeave(event, this)" ondrop="drop(event, '${area}', this)">`;
        
        if(empleadosAlmDb[area]) {
            empleadosAlmDb[area].forEach((nombreStr, index) => { 
                const cedulaStr = mapCedulas[nombreStr] || '';
                htmlArea += `<li draggable="true" ondragstart="dragStart(event, '${area}', ${index})">
                    <div style="flex:1; cursor:pointer; text-align:left;" onclick="abrirModalEditarAlm('${area}', ${index})" title="Clic para editar">
                        <span style="font-weight:600; color:var(--text-main);"><i class="fas fa-pen" style="color:var(--nava-silver); font-size:10px; margin-right:5px;"></i> ${nombreStr}</span>
                        ${cedulaStr ? `<br><span style="font-size:10px; color:var(--nava-cyan); margin-left:18px;"><i class="fas fa-id-card"></i> ${cedulaStr}</span>` : ''}
                    </div><button class="btn-delete-small" style="width: auto; padding: 2px 6px;" onclick="eliminarEmpleadoAlmuerzo('${area}', ${index})">✕</button>
                </li>`; 
            });
        }
        htmlArea += `</ul></div>`; grid.innerHTML += htmlArea;
    }
};

window.abrirModalEditarAlm = function(area, index) {
    const nombreStr = empleadosAlmDb[area][index];
    const cedulaStr = (empleadosAlmDb.cedulas && empleadosAlmDb.cedulas[nombreStr]) ? empleadosAlmDb.cedulas[nombreStr] : '';
    document.getElementById('edit-alm-old-area').value = area; document.getElementById('edit-alm-index').value = index; document.getElementById('edit-alm-area').value = area;
    document.getElementById('edit-alm-cedula').value = cedulaStr; document.getElementById('edit-alm-nombre').value = nombreStr;
    document.getElementById('modal-editar-alm').style.display = 'flex';
};

window.guardarEdicionAlm = async function() {
    const oldArea = document.getElementById('edit-alm-old-area').value; const index = parseInt(document.getElementById('edit-alm-index').value); const newArea = document.getElementById('edit-alm-area').value;
    const cedula = document.getElementById('edit-alm-cedula').value.trim(); const nombreNuevo = document.getElementById('edit-alm-nombre').value.trim().toUpperCase();
    if(!nombreNuevo) return mostrarAlertaCustom("El nombre no puede estar vacío.", "warning");

    const nombreViejo = empleadosAlmDb[oldArea][index]; const ref = doc(db, "configuracion", "empleados");
    try {
        let updates = {};
        if (oldArea === newArea) { await updateDoc(ref, { [oldArea]: arrayRemove(nombreViejo) }); updates[oldArea] = arrayUnion(nombreNuevo); } 
        else { updates[oldArea] = arrayRemove(nombreViejo); updates[newArea] = arrayUnion(nombreNuevo); }
        if (nombreViejo !== nombreNuevo) updates[`cedulas.${nombreViejo}`] = deleteField();
        if (cedula) updates[`cedulas.${nombreNuevo}`] = cedula;
        await updateDoc(ref, updates);
        cerrarModal('modal-editar-alm');
        const aviso = (oldArea === newArea) ? `Datos de ${nombreNuevo} actualizados.` : `${nombreNuevo} fue movido a ${newArea === "FACTURACION" ? "FACTURACIÓN" : newArea}.`;
        await refrescarAlmuerzos(aviso);
    } catch (e) { mostrarAlertaCustom("Error al actualizar.", "error"); }
};

window.agregarEmpleadoAlmuerzo = async function() {
    const area = document.getElementById("area-gestion").value; const cedula = document.getElementById("nuevo-cedula-alm").value.trim(); const nombre = document.getElementById("nuevo-empleado-alm").value.trim().toUpperCase();
    if(!nombre) return mostrarAlertaCustom("El Nombre es obligatorio.", 'warning');
    const updates = { [area]: arrayUnion(nombre) }; if(cedula) updates[`cedulas.${nombre}`] = cedula;
    await updateDoc(doc(db, "configuracion", "empleados"), updates);
    document.getElementById("nuevo-cedula-alm").value = "";
    document.getElementById("nuevo-empleado-alm").value = "";
    document.getElementById("nuevo-empleado-alm").focus();
    await refrescarAlmuerzos(`${nombre} fue agregado a ${area === "FACTURACION" ? "FACTURACIÓN" : area}.`);
};

window.eliminarEmpleadoAlmuerzo = function(area, index) {
    const nombreStr = empleadosAlmDb[area][index];
    mostrarConfirmacionCustom(`¿Eliminar a ${nombreStr}?`, async () => {
        const updates = { [area]: arrayRemove(nombreStr) }; updates[`cedulas.${nombreStr}`] = deleteField();
        await updateDoc(doc(db, "configuracion", "empleados"), updates);
        await refrescarAlmuerzos(`${nombreStr} fue eliminado del listado.`);
    }, true);
};

let dragInfo = null;
window.dragStart = function(event, area, index) { dragInfo = { area, index }; event.dataTransfer.effectAllowed = "move"; };
window.allowDrop = function(event, el) { event.preventDefault(); el.classList.add('drag-over'); };
window.dragLeave = function(event, el) { el.classList.remove('drag-over'); };
window.drop = async function(event, targetArea, el) {
    event.preventDefault(); el.classList.remove('drag-over'); if(!dragInfo) return;
    const { area: oldArea, index } = dragInfo; dragInfo = null; if(oldArea === targetArea) return; 
    const nombreStr = empleadosAlmDb[oldArea][index]; const ref = doc(db, "configuracion", "empleados");
    await updateDoc(ref, { [oldArea]: arrayRemove(nombreStr), [targetArea]: arrayUnion(nombreStr) });
    await refrescarAlmuerzos();
};

// ==========================================================================
//   8. DASHBOARD ADMIN: ASISTENCIA BIOMÉTRICA
// ==========================================================================
window.abrirModalBioPersonal = async function() {
    document.getElementById('modal-gestion-bio').style.display = 'flex';
    document.getElementById('tabla-personal-bio').innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Cargando personal...</td></tr>';
    const querySnapshot = await getDocs(collection(db, "personal"));
    personalBioGlobal = []; querySnapshot.forEach(d => { personalBioGlobal.push({ cedula: d.id, ...d.data() }); });
    pintarTablaPersonalBio(); cargarFiltroEmpleadosAsistencia(); 
};

function pintarTablaPersonalBio() {
    const tbody = document.getElementById('tabla-personal-bio'); tbody.innerHTML = '';
    if(personalBioGlobal.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No hay personal registrado.</td></tr>'; return; }
    personalBioGlobal.sort((a,b) => a.nombre.localeCompare(b.nombre)).forEach(emp => {
        const horaDisp = emp.horaIngreso || '07:30';
        tbody.innerHTML += `<tr>
            <td>${emp.cedula}</td><td><strong>${emp.nombre}</strong></td><td>${emp.ciudad}</td>
            <td><span class="badge-status" style="border-color:var(--nava-cyan); color:var(--nava-cyan);"><i class="fas fa-clock"></i> ${horaDisp}</span></td>
            <td style="display:flex; gap:8px;">
                <button class="btn-edit-small" onclick="abrirModalEditarBio('${emp.cedula}', '${emp.nombre}', '${emp.ciudad}', '${horaDisp}')">Editar</button>
                <button class="btn-delete-small" onclick="eliminarEmpleadoBio('${emp.cedula}', '${emp.nombre}')">Eliminar</button>
            </td>
        </tr>`;
    });
}

window.abrirModalEditarBio = function(cedula, nombre, ciudad, horaIngreso) {
    document.getElementById('edit-bio-cedula').value = cedula; document.getElementById('edit-bio-nombre').value = nombre; document.getElementById('edit-bio-ciudad').value = ciudad; document.getElementById('edit-bio-hora').value = horaIngreso; document.getElementById('modal-editar-bio').style.display = 'flex';
};

window.guardarEdicionBio = async function() {
    const cedula = document.getElementById('edit-bio-cedula').value; const nombre = document.getElementById('edit-bio-nombre').value.trim().toUpperCase(); const ciudad = document.getElementById('edit-bio-ciudad').value; const horaIngreso = document.getElementById('edit-bio-hora').value;
    if(!nombre) return mostrarAlertaCustom("El nombre no puede estar vacío.", "warning");
    try {
        await updateDoc(doc(db, "personal", cedula), { nombre: nombre, ciudad: ciudad, horaIngreso: horaIngreso });
        mostrarAlertaCustom("Empleado actualizado.", "success"); cerrarModal('modal-editar-bio'); abrirModalBioPersonal(); 
    } catch (e) { mostrarAlertaCustom("Error.", "error"); }
};

window.agregarEmpleadoBio = async function() {
    const cedula = document.getElementById('bio-cedula').value.trim(); const nombre = document.getElementById('bio-nombre').value.trim().toUpperCase(); const ciudad = document.getElementById('bio-ciudad').value; const horaIngreso = document.getElementById('bio-hora').value; 
    if(!cedula || !nombre) return mostrarAlertaCustom("Cédula y Nombre son obligatorios.", 'warning');
    const btn = document.querySelector('#modal-gestion-bio .btn-primary'); btn.disabled = true; btn.innerText = "Guardando...";
    try { await setDoc(doc(db, "personal", cedula), { nombre, ciudad, horaIngreso }); document.getElementById('bio-cedula').value = ""; document.getElementById('bio-nombre').value = ""; abrirModalBioPersonal(); } 
    catch (e) { mostrarAlertaCustom("Error.", 'error'); }
    btn.disabled = false; btn.innerText = "Agregar Empleado";
};

window.eliminarEmpleadoBio = function(cedula, nombre) {
    mostrarConfirmacionCustom(`¿Eliminar empleado:\n${nombre} (C.C. ${cedula})?`, async () => {
        try { await deleteDoc(doc(db, "personal", cedula)); abrirModalBioPersonal(); } catch (e) { mostrarAlertaCustom("Error", 'error'); }
    }, true);
};

window.actualizarListasEnVivoAsistencia = async function() {
    const btns = document.querySelectorAll('button[onclick="actualizarListasEnVivoAsistencia()"]');
    btns.forEach(b => { b.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...'; b.disabled = true; });

    const qBio = await getDocs(collection(db, "personal"));
    personalBioGlobal = []; qBio.forEach(d => personalBioGlobal.push({ cedula: d.id, ...d.data() }));
    cargarFiltroEmpleadosAsistencia(); 

    const p = hoyStr.split('-'); const hoyFmt = `${p[2]}/${p[1]}/${p[0]}`; 
    const qMarcaciones = query(collection(db, "marcaciones"), where("fecha", "==", hoyFmt));
    const snap = await getDocs(qMarcaciones);
    let marcacionesHoy = []; snap.forEach(d => marcacionesHoy.push(d.data()));

    const listPend = document.getElementById("list-asis-pendientes"), listTrab = document.getElementById("list-asis-trabajando"), listComp = document.getElementById("list-asis-completados");
    let cPend = 0, cTrab = 0, cComp = 0; listPend.innerHTML = ""; listTrab.innerHTML = ""; listComp.innerHTML = "";

    personalBioGlobal.sort((a,b) => a.nombre.localeCompare(b.nombre)).forEach(emp => {
        const rec = marcacionesHoy.find(m => m.cedula === emp.cedula);
        if (!rec) { listPend.innerHTML += `<li><span class="nombre">${emp.nombre}</span> <span class="time-badge" style="color:var(--text-muted); border-color:var(--border-color); background:transparent;">Asignado: ${emp.horaIngreso || '07:30'}</span></li>`; cPend++; } 
        else if (rec && !rec.horaSalida) { listTrab.innerHTML += `<li><span class="nombre">${emp.nombre}</span> <span class="time-badge" style="color:var(--warning); border-color:var(--warning); background:rgba(255,234,0,0.1);"><i class="fas fa-arrow-right"></i> ${rec.horaEntrada}</span></li>`; cTrab++; } 
        else if (rec && rec.horaSalida) { listComp.innerHTML += `<li><span class="nombre">${emp.nombre}</span> <span class="time-badge" style="color:var(--success); border-color:var(--success); background:rgba(0,230,118,0.1);"><i class="fas fa-arrow-left"></i> ${rec.horaSalida}</span></li>`; cComp++; }
    });
    document.getElementById("count-asis-pendientes").innerText = cPend; document.getElementById("count-asis-trabajando").innerText = cTrab; document.getElementById("count-asis-completados").innerText = cComp;

    btns.forEach(b => { b.innerHTML = '<i class="fas fa-sync-alt"></i> Actualizar'; b.disabled = false; });
};

window.inicializarDashboardAsistencia = async function() { await actualizarListasEnVivoAsistencia(); };

window.cargarFiltroEmpleadosAsistencia = function() {
    const select = document.getElementById("buscar-nombre-asis"); if (!select) return; select.innerHTML = '<option value="">-- Seleccionar --</option>';
    const listaNombres = personalBioGlobal.map(p => p.nombre).sort(); listaNombres.forEach(n => select.innerHTML += `<option value="${n}">${n}</option>`);
};

window.buscarHistorialAsistencia = async function() {
    const nombreBuscado = document.getElementById("buscar-nombre-asis").value;
    if(!nombreBuscado) return mostrarAlertaCustom("Seleccione un empleado.", 'warning');

    const tb = document.getElementById('tabla-resultados-asistencia'); tb.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Buscando...</td></tr>';
    document.getElementById("contenedor-tabla-asistencia").style.display = "block";

    try {
        const q = query(collection(db, "marcaciones"), where("nombre", "==", nombreBuscado)); const qs = await getDocs(q);
        let resultados = []; qs.forEach(d => resultados.push(d.data()));
        resultados.sort((a,b) => { const [da, ma, ya] = a.fecha.split('/'); const [db, mb, yb] = b.fecha.split('/'); return new Date(yb, mb-1, db) - new Date(ya, ma-1, da); });

        tb.innerHTML = "";
        if(resultados.length === 0) { tb.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Sin registros.</td></tr>'; return; }
        resultados.forEach(info => {
            tb.innerHTML += `<tr>
                <td><strong>${info.nombre}</strong><br><small style="color:var(--text-muted)">C.C. ${info.cedula}</small></td>
                <td>${info.fecha}</td>
                <td style="color:var(--success); font-weight:600;"><i class="fas fa-arrow-right"></i> ${info.horaEntrada || '-'}</td>
                <td style="color:var(--nava-cyan); font-weight:600;"><i class="fas fa-arrow-left"></i> ${info.horaSalida || '-'}</td>
                <td><span class="badge-status">${info.estado}</span></td>
            </tr>`;
        });
    } catch(e) { tb.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--danger);">Error.</td></tr>'; }
};

window.limpiarBusquedaAsistencia = function() { document.getElementById("buscar-nombre-asis").value = ""; document.getElementById("contenedor-tabla-asistencia").style.display = "none"; };

document.getElementById('btn-descargar-reporte').addEventListener('click', async () => {
    const btn = document.querySelector('button[onclick="document.getElementById(\'btn-descargar-reporte\').click()"]'); btn.disabled = true; btn.innerText = "Descargando...";
    try {
        const querySnapshot = await getDocs(collection(db, "marcaciones")); const registrosExcel = [];
        querySnapshot.forEach((docSnap) => {
            const d = docSnap.data();
            registrosExcel.push({ "Fecha": parseFechaExcel(d.fecha), "Cédula": d.cedula, "Nombres": d.nombre, "Ciudad": d.ciudad, "Entrada": d.horaEntrada || "-", "Atraso": d.atraso || "-", "Salida": d.horaSalida || "Sin marcar", "Trabajado": d.tiempoTrabajado || "-", "Horas Extras": d.horasExtras || "-", "Estado": d.estado });
        });
        if (registrosExcel.length === 0) { mostrarAlertaCustom("No hay registros.", 'warning'); btn.disabled = false; btn.innerText = "Exportar"; return; }
        const hoja = XLSX.utils.json_to_sheet(registrosExcel, { cellDates: true }); const libro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(libro, hoja, "Asistencia"); XLSX.writeFile(libro, "Reporte_Asistencia.xlsx");
        btn.disabled = false; btn.innerText = "Exportar";
    } catch (error) { mostrarAlertaCustom("Error Excel.", 'error'); btn.disabled = false; btn.innerText = "Exportar"; }
});

window.abrirModalCorreccion = function() { document.getElementById('modal-corregir-bio').style.display = 'flex'; document.getElementById('fecha-corregir').value = new Date().toLocaleDateString('en-CA'); buscarMarcacionesParaCorregirAdmin(); };

window.buscarMarcacionesParaCorregirAdmin = async function() {
    const fechaInput = document.getElementById('fecha-corregir').value; if(!fechaInput) return;
    const partes = fechaInput.split('-'); const fechaBuscada = `${partes[2]}/${partes[1]}/${partes[0]}`;
    const tbody = document.getElementById('tabla-correccion-bio'); tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Buscando...</td></tr>';
    
    try {
        const q = query(collection(db, "marcaciones"), where("fecha", "==", fechaBuscada)); const querySnapshot = await getDocs(q); tbody.innerHTML = "";
        if(querySnapshot.empty) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Sin registros en la fecha seleccionada.</td></tr>'; return; }
        
        querySnapshot.forEach(d => {
            const info = d.data(); const idDoc = d.id; const tieneSalida = !!info.horaSalida; 
            tbody.innerHTML += `<tr>
                <td><strong>${info.nombre}</strong><br><span style="font-size:11px; color:var(--text-muted);">C.C. ${info.cedula}</span></td>
                <td style="color:var(--success); font-weight:600; text-shadow:0 0 5px rgba(0,230,118,0.4);"><i class="fas fa-arrow-right"></i> ${info.horaEntrada || '-'}</td>
                <td style="color:var(--nava-cyan); font-weight:600; text-shadow:0 0 5px rgba(0,229,255,0.4);"><i class="fas fa-arrow-left"></i> ${info.horaSalida || '-'}</td>
                <td><span class="badge-status">${info.estado}</span></td>
                <td style="display:flex; gap:8px;">
                    ${tieneSalida ? `<button class="btn-delete-small btn-delete-wide" style="background:rgba(255,234,0,0.1); color:var(--warning); border-color:var(--warning);" onclick="eliminarSoloSalida('${idDoc}', '${info.nombre}')">Borrar Salida</button>` : ''}
                    <button class="btn-delete-small btn-delete-wide" onclick="eliminarMarcacionErronea('${idDoc}', '${info.nombre}')">Borrar Entrada</button>
                </td>
            </tr>`;
        });
    } catch(e) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--danger);">Error.</td></tr>'; }
};

window.eliminarSoloSalida = function(idDocumento, nombre) {
    mostrarConfirmacionCustom(`¿Eliminar SALIDA de ${nombre}?`, async () => {
        try {
            await updateDoc(doc(db, "marcaciones", idDocumento), { horaSalida: deleteField(), tiempoTrabajado: deleteField(), horasExtras: deleteField(), ubicacionSalida: deleteField(), enlaceGoogleMapsSalida: deleteField(), estado: "Trabajando" });
            mostrarAlertaCustom("Salida eliminada.", 'success'); buscarMarcacionesParaCorregirAdmin(); 
        } catch(e) { mostrarAlertaCustom("Error.", 'error'); }
    }, false);
};

window.eliminarMarcacionErronea = function(idDocumento, nombre) {
    mostrarConfirmacionCustom(`¿Borrar ENTRADA Y SALIDA de ${nombre}?`, async () => {
        try { await deleteDoc(doc(db, "marcaciones", idDocumento)); mostrarAlertaCustom("Jornada eliminada.", 'success'); buscarMarcacionesParaCorregirAdmin(); } 
        catch(e) { mostrarAlertaCustom("Error.", 'error'); }
    }, true);
};