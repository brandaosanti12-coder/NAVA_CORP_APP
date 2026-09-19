import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, query, where, getDocs, serverTimestamp, deleteField } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = { apiKey: "AIzaSyCyzE_spj6e0VASt5FP50_5m2Ya-GJloM4", authDomain: "registro-bionetrico.firebaseapp.com", projectId: "registro-bionetrico" };
const app = initializeApp(firebaseConfig); 
const db = getFirestore(app);

const hoyStr = new Date().toLocaleDateString('sv-SE');
let timerEnVivo = null, empleadosERPGlobal = [], registrosAlmGlobales = [], marcacionesGlobales = [];
let idDocumentoFirebase = null;
let timerAlmuerzoEmpleado = null;
let cedulaOriginalEditar = null; 
window.modoAlmuerzoGlobal = 'TOKEN'; 
window.empleadosEnAlmuerzo = [];
let areasDinamicas = ["PLAYA", "FACTURACION", "OFICINA"];

// ==========================================================================
//   1. FUNCIONES UTILITARIAS Y ALERTAS
// ==========================================================================
window.cerrarModal = function(id) { document.getElementById(id).style.display = 'none'; };

window.mostrarAlertaCustom = function(mensaje, tipo = 'warning') {
    const content = document.querySelector('#modal-alerta .modal-caja');
    const titulo = document.getElementById('alerta-titulo');
    if(tipo === 'error') { content.style.borderTopColor = 'var(--danger)'; titulo.style.color = 'var(--danger)'; titulo.innerHTML = '<i class="fas fa-times-circle"></i> Error'; } 
    else if(tipo === 'success') { content.style.borderTopColor = 'var(--success)'; titulo.style.color = 'var(--success)'; titulo.innerHTML = '<i class="fas fa-check-circle"></i> Éxito'; } 
    else { content.style.borderTopColor = 'var(--warning)'; titulo.style.color = 'var(--warning)'; titulo.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Atención'; }
    document.getElementById('alerta-mensaje').innerText = mensaje; document.getElementById('modal-alerta').style.display = 'flex';
};

window.mostrarConfirmacionCustom = function(mensaje, callback, isDanger = false) {
    document.getElementById('confirmacion-mensaje').innerText = mensaje; document.getElementById('modal-confirmacion').style.display = 'flex';
    const content = document.querySelector('#modal-confirmacion .modal-caja'); const btnConfirmar = document.getElementById('btn-confirmar-accion'); const titulo = document.getElementById('confirmacion-titulo');
    if(isDanger) { btnConfirmar.className = 'btn-danger'; titulo.style.color = 'var(--danger)'; content.style.borderTopColor = 'var(--danger)'; titulo.innerHTML = '<i class="fas fa-exclamation-circle"></i> Confirmar Acción'; } 
    else { btnConfirmar.className = 'btn-primary'; titulo.style.color = 'var(--nava-cyan)'; content.style.borderTopColor = 'var(--nava-cyan)'; titulo.innerHTML = '<i class="fas fa-question-circle"></i> Confirmar Acción'; }
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
    let m = Math.floor(minutosTotales); let h = Math.floor(m / 60); let restM = m % 60;
    if (h > 0) return `${h}h ${restM}m`; return `${restM} minutos`;
}

// ==========================================================================
//   2. NAVEGACIÓN ENTRE VISTAS
// ==========================================================================
window.onload = function() { history.replaceState({ vista: 'inicio' }, "", window.location.pathname + window.location.search); };

window.navegar = function(vistaId, pushToHistory = true) {
    document.getElementById('pantalla-inicio').style.display = 'none'; document.getElementById('app-container').style.display = 'flex'; 
    document.querySelectorAll('.view-section').forEach(v => v.style.display = 'none'); document.getElementById(vistaId).style.display = 'flex';

    if (vistaId === 'view-admin' || vistaId === 'view-dashboard-empleado') document.getElementById('btn-volver-global').style.display = 'none'; else document.getElementById('btn-volver-global').style.display = 'block';
    if (pushToHistory) history.pushState({ vista: vistaId }, "", `#${vistaId}`);
};

window.volverInicio = function(pushToHistory = true) {
    document.getElementById('app-container').style.display = 'none'; document.getElementById('pantalla-inicio').style.display = 'flex';
    if (pushToHistory) history.pushState({ vista: 'inicio' }, "", window.location.pathname + window.location.search);
};

window.addEventListener('popstate', (event) => {
    if (event.state && event.state.vista && event.state.vista !== 'inicio') navegar(event.state.vista, false);
    else { document.getElementById('app-container').style.display = 'none'; document.getElementById('pantalla-inicio').style.display = 'flex'; }
});

// ==========================================================================
//   3. AUTENTICACIÓN Y CONTROL DEL DASHBOARD EMPLEADO
// ==========================================================================
window.loginEmpleado = async function() {
    const inputCedula = document.getElementById('login-cedula').value.trim();
    const inputPass = document.getElementById('login-password').value.trim();
    
    if(!inputCedula) return mostrarAlertaCustom("Por favor, ingrese su número de cédula.", "warning");
    if(!inputPass) return mostrarAlertaCustom("Por favor, ingrese su contraseña.", "warning");

    const btn = document.querySelector('button[onclick="loginEmpleado()"]');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando ERP...';

    try {
        const refEmpleado = doc(db, "empleados", inputCedula);
        const snap = await getDoc(refEmpleado);

        if(snap.exists()) {
            const datos = snap.data();
            const passGuardada = datos.password || inputCedula; 

            if(inputPass !== passGuardada) {
                mostrarAlertaCustom("Contraseña incorrecta. Verifique sus credenciales.", "error");
            } else {
                document.getElementById('dash-nombre-empleado').innerText = datos.nombres;
                document.getElementById('cedula').value = inputCedula; 
                
                await refrescarDashboardEmpleado();

                document.getElementById('login-cedula').value = ""; 
                document.getElementById('login-password').value = "";
                navegar('view-dashboard-empleado');
            }
        } else { mostrarAlertaCustom("Empleado no registrado en el ERP. Solicite su registro en el Panel de Administrador.", "error"); }
    } catch (error) { console.error(error); mostrarAlertaCustom("Error de conexión al ERP.", "error"); }
    
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Acceder al Portal';
};

window.cerrarSesionEmpleado = function() {
    if(timerAlmuerzoEmpleado) clearInterval(timerAlmuerzoEmpleado);
    document.getElementById('dash-nombre-empleado').innerText = "NOMBRE EMPLEADO"; document.getElementById('cedula').value = ""; volverInicio();
};

// REFRESCAR TODO EL DASHBOARD (PERFIL, PERMISOS DE MÓDULO Y HORARIO CONDICIONAL)
window.refrescarDashboardEmpleado = async function() {
    const btn = document.getElementById('btn-refrescar-dash');
    const cedulaValor = document.getElementById('cedula').value.trim();
    if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refrescando...'; }
    
    if(cedulaValor) {
        try {
            // 1. RECONSULTAR PERFIL ACTUALIZADO EN FIRESTORE
            const snapEmp = await getDoc(doc(db, "empleados", cedulaValor));
            if(snapEmp.exists()) {
                const datos = snapEmp.data();
                document.getElementById('dash-nombre-empleado').innerText = datos.nombres;
                document.getElementById('txt-ciudad').innerText = datos.ciudad || "QUITO";
                document.getElementById('txt-area').innerText = datos.area || "GENERAL";
                document.getElementById('txt-horario-asignado').innerText = datos.horaIngreso || "07:30";

                window.permisosUsuarioActivo = {
                    asistencia: datos.permisoAsistencia !== false,
                    almuerzo: datos.permisoAlmuerzo !== false
                };

                // MOSTRAR U OCULTAR EL BLOQUE DE HORARIO SEGÚN PERMISO DE ASISTENCIA
                const contenedorHorario = document.getElementById('lbl-contenedor-horario');
                if (contenedorHorario) {
                    contenedorHorario.style.display = window.permisosUsuarioActivo.asistencia ? 'inline' : 'none';
                }

                // Actualizar visibilidad de botones en el Grid
                document.getElementById('btn-act-entrada').style.display = window.permisosUsuarioActivo.asistencia ? 'flex' : 'none';
                document.getElementById('btn-act-salida').style.display = window.permisosUsuarioActivo.asistencia ? 'flex' : 'none';
                document.getElementById('btn-act-ir-almuerzo').style.display = window.permisosUsuarioActivo.almuerzo ? 'flex' : 'none';
                document.getElementById('btn-act-volver-almuerzo').style.display = window.permisosUsuarioActivo.almuerzo ? 'flex' : 'none';

                // Actualizar visibilidad de las tarjetas de resumen
                document.getElementById('resumen-asistencia-block').style.display = window.permisosUsuarioActivo.asistencia ? 'block' : 'none';
                document.getElementById('resumen-almuerzo-block').style.display = window.permisosUsuarioActivo.almuerzo ? 'block' : 'none';
            }

            // 2. RECONSULTAR CONFIGURACIÓN GLOBAL MODO ALMUERZO (TOKEN / QR)
            const snapAjustes = await getDoc(doc(db, "configuracion", "ajustes_sistema"));
            if(snapAjustes.exists()) {
                window.modoAlmuerzoGlobal = snapAjustes.data().modo_almuerzo || 'TOKEN';
            }

            // 3. RECARGAR REGISTROS EN VIVO
            const nombreActual = document.getElementById('dash-nombre-empleado').innerText;
            await cargarEstadoUnificadoEmpleado(nombreActual);

        } catch (error) {
            console.error("Error al refrescar dashboard:", error);
        }
    }
    
    if(btn) {
        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sync-alt"></i> Actualizar';
        }, 300);
    }
};

// ==========================================================================
//   4. LÓGICA DE REGISTRO Y DETECCIÓN DE ESTADO
// ==========================================================================
async function cargarEstadoUnificadoEmpleado(nombre) {
    const cedulaValor = document.getElementById('cedula').value.trim();
    if (!cedulaValor) return;

    const ahora = new Date();
    const fechaCorta = String(ahora.getDate()).padStart(2, '0') + "/" + String(ahora.getMonth() + 1).padStart(2, '0') + "/" + ahora.getFullYear();

    let tieneEntrada = false;
    let tieneSalidaJornada = false;
    let tieneSalidaAlm = false;
    let tieneRegresoAlm = false;

    // 1. EVALUAR ASISTENCIA EN FIRESTORE
    try {
        const qAsis = query(collection(db, "marcaciones"), where("cedula", "==", cedulaValor), where("fecha", "==", fechaCorta));
        const snapAsis = await getDocs(qAsis);

        if (!snapAsis.empty) {
            let d = null;
            snapAsis.forEach(docSnap => { d = docSnap.data(); idDocumentoFirebase = docSnap.id; });

            tieneEntrada = true;
            document.getElementById('txt-hora-entrada').innerText = d.horaEntrada || "--:--";
            document.getElementById('txt-ubicacion-entrada').innerHTML = d.enlaceGoogleMapsEntrada || d.ubicacionEntrada || "Registrada";

            if (d.atraso && d.atraso !== "A tiempo") {
                document.getElementById('caja-atraso').style.display = "flex";
                document.getElementById('txt-atraso').innerText = d.atraso;
            } else {
                document.getElementById('caja-atraso').style.display = "none";
            }

            if (d.horaSalida) {
                tieneSalidaJornada = true;
                document.getElementById('txt-hora-salida').innerText = d.horaSalida;
                document.getElementById('txt-ubicacion-salida').innerHTML = d.enlaceGoogleMapsSalida || d.ubicacionSalida || "Registrada";
                
                let resumenSalida = d.tiempoTrabajado || "--";
                if(d.horasExtras && d.horasExtras !== "0 minutos") {
                    resumenSalida += ` (Extras: ${d.horasExtras})`;
                }
                document.getElementById('txt-trabajado').innerText = resumenSalida;
            } else {
                document.getElementById('txt-hora-salida').innerText = "--:--";
                document.getElementById('txt-ubicacion-salida').innerText = "Pendiente...";
                document.getElementById('txt-trabajado').innerText = "En curso...";
            }
        } else {
            document.getElementById('txt-hora-entrada').innerText = "--:--";
            document.getElementById('txt-ubicacion-entrada').innerText = "Pendiente...";
            document.getElementById('caja-atraso').style.display = "none";
            document.getElementById('txt-hora-salida').innerText = "--:--";
            document.getElementById('txt-ubicacion-salida').innerText = "Pendiente...";
            document.getElementById('txt-trabajado').innerText = "--";
        }
    } catch (e1) { console.error("Error cargando asistencia:", e1); }

    // 2. EVALUAR ALMUERZO EN FIRESTORE
    try {
        const refAlm = doc(db, "registros", nombre + "_" + hoyStr);
        const snapAlm = await getDoc(refAlm);

        if (snapAlm.exists()) {
            const dA = snapAlm.data();
            if (dA.salida) {
                tieneSalidaAlm = true;
                const salidaMs = dA.salida.seconds * 1000;
                document.getElementById('txt-alm-inicio').innerText = new Date(salidaMs).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            }
            if (dA.regreso) {
                tieneRegresoAlm = true;
                const regresoMs = dA.regreso.seconds * 1000;
                document.getElementById('txt-alm-fin').innerText = new Date(regresoMs).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

                const salidaMs = dA.salida.seconds * 1000;
                const usadoMin = Math.floor((regresoMs - salidaMs) / 60000);
                const excedeMin = usadoMin - 60;

                if (excedeMin > 0) {
                    document.getElementById('txt-alm-estado').innerHTML = `<span style="color:var(--danger)">Completado - Excedido (${formatoHorasMinutos(excedeMin)})</span>`;
                } else {
                    document.getElementById('txt-alm-estado').innerHTML = `<span style="color:var(--success)">Completado - A tiempo (${formatoHorasMinutos(usadoMin)})</span>`;
                }
            } else if (dA.salida && !dA.regreso) {
                document.getElementById('txt-alm-fin').innerText = "--:--";
                document.getElementById('txt-alm-estado').innerHTML = `<span style="color:var(--warning)"><i class="fas fa-spinner fa-spin"></i> En curso...</span>`;
            }
        } else {
            document.getElementById('txt-alm-inicio').innerText = "--:--";
            document.getElementById('txt-alm-fin').innerText = "--:--";
            document.getElementById('txt-alm-estado').innerText = "Sin registrar";
        }
    } catch (e2) { console.error("Error cargando almuerzo:", e2); }

    // 3. SECUENCIA Y ESTADO DE LOS BOTONES
    const btnEntrada = document.getElementById('btn-act-entrada');
    const btnSalida = document.getElementById('btn-act-salida');
    const btnIrAlm = document.getElementById('btn-act-ir-almuerzo');
    const btnVolverAlm = document.getElementById('btn-act-volver-almuerzo');

    // Botones Asistencia
    btnEntrada.disabled = tieneEntrada;
    btnSalida.disabled = !tieneEntrada || tieneSalidaJornada;

    // Botones Almuerzo
    btnIrAlm.disabled = tieneSalidaAlm;
    btnVolverAlm.disabled = !tieneSalidaAlm || tieneRegresoAlm;

    if (tieneSalidaJornada) {
        btnEntrada.disabled = true;
        btnSalida.disabled = true;
    }
}

async function obtenerHoraDeLaWeb() {
    try {
        const respuesta = await fetch('https://timeapi.io/api/Time/current/zone?timeZone=America/Guayaquil');
        if (!respuesta.ok) throw new Error("Fallo en servidor");
        const datos = await respuesta.json(); return new Date(datos.dateTime);
    } catch (error) { return new Date(); }
}

function obtenerUbicacion() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) resolve("Sin GPS");
        navigator.geolocation.getCurrentPosition(
            (posicion) => resolve(`<a href="https://www.google.com/maps?q=${posicion.coords.latitude},${posicion.coords.longitude}" target="_blank" style="color:var(--nava-cyan); font-weight:bold;"><i class="fas fa-map-marker-alt"></i> Ver GPS</a>`),
            (error) => resolve("Ubicación No Permitida"), { enableHighAccuracy: true, timeout: 5000 }
        );
    });
}

window.procesarMarcacion = async function(tipo) {
    const cedulaValor = document.getElementById('cedula').value.trim();
    const nombreEmpleado = document.getElementById('dash-nombre-empleado').innerText;
    if (cedulaValor === "") return mostrarAlertaCustom("Error de sesión. Vuelva a iniciar sesión.", "error");

    const btnId = tipo === 'entrada' ? 'btn-act-entrada' : 'btn-act-salida';
    document.getElementById(btnId).disabled = true;

    try {
        const refEmpleado = doc(db, "empleados", cedulaValor);
        const snapEmpleado = await getDoc(refEmpleado);
        const datosEmpleado = snapEmpleado.data();
        const horaAsignadaStr = datosEmpleado.horaIngreso || "07:30";
        const [hIng, mIng] = horaAsignadaStr.split(':').map(Number);
        
        const horaSistema = await obtenerHoraDeLaWeb();
        const horaFormateada = horaSistema.toLocaleTimeString('es-ES', { hour: '2-digit', minute:'2-digit', second:'2-digit' });
        const fechaCorta = String(horaSistema.getDate()).padStart(2, '0') + "/" + String(horaSistema.getMonth() + 1).padStart(2, '0') + "/" + horaSistema.getFullYear();

        const consulta = query(collection(db, "marcaciones"), where("cedula", "==", cedulaValor), where("fecha", "==", fechaCorta));
        const resultadosConsulta = await getDocs(consulta);
        
        let registroExistente = null; let idDocExistente = null;
        resultadosConsulta.forEach((docSnap) => { registroExistente = docSnap.data(); idDocExistente = docSnap.id; });

        if (tipo === 'entrada') {
            document.getElementById('txt-ubicacion-entrada').innerText = "Obteniendo GPS...";
            const enlaceUbicacion = await obtenerUbicacion();
            
            let textoAtraso = "A tiempo"; 
            const limiteEntrada = new Date(horaSistema); 
            limiteEntrada.setHours(hIng, mIng, 0, 0); 
            if (horaSistema > limiteEntrada) {
                textoAtraso = formatoHorasMinutos((horaSistema - limiteEntrada) / 60000);
            }

            const nuevoRegistro = await addDoc(collection(db, "marcaciones"), {
                cedula: cedulaValor, nombre: datosEmpleado.nombres, ciudad: datosEmpleado.ciudad || "QUITO", fecha: fechaCorta,
                horaEntrada: horaFormateada, tiempoEntradaMs: horaSistema.getTime(), atraso: textoAtraso,
                ubicacionEntrada: enlaceUbicacion.replace(/<[^>]*>?/gm, 'Link Mapa'), enlaceGoogleMapsEntrada: enlaceUbicacion, estado: "Trabajando", horarioAsignado: horaAsignadaStr
            });
            idDocumentoFirebase = nuevoRegistro.id;
            
            mostrarAlertaCustom("¡Entrada registrada correctamente!", "success");

        } else if (tipo === 'salida') {
            document.getElementById('txt-ubicacion-salida').innerText = "Obteniendo GPS...";
            const enlaceUbicacion = await obtenerUbicacion();
            
            let msEntrada = registroExistente ? registroExistente.tiempoEntradaMs : horaSistema.getTime();
            let msTrabajados = horaSistema.getTime() - msEntrada;
            let tiempoTrabajadoStr = formatoHorasMinutos(msTrabajados / 60000);
            
            let horasExtrasStr = "0 minutos";
            if (msTrabajados > (8 * 60 * 60 * 1000)) {
                horasExtrasStr = formatoHorasMinutos((msTrabajados - (8 * 60 * 60 * 1000)) / 60000);
            }

            await updateDoc(doc(db, "marcaciones", idDocExistente || idDocumentoFirebase), {
                horaSalida: horaFormateada, 
                tiempoTrabajado: tiempoTrabajadoStr, 
                horasExtras: horasExtrasStr,
                ubicacionSalida: enlaceUbicacion.replace(/<[^>]*>?/gm, 'Link Mapa'), 
                enlaceGoogleMapsSalida: enlaceUbicacion, 
                estado: "Turno Finalizado"
            });
            
            mostrarAlertaCustom("¡Jornada finalizada correctamente!", "success");
        }

        await cargarEstadoUnificadoEmpleado(nombreEmpleado);

    } catch (error) { 
        console.error(error);
        mostrarAlertaCustom("Ocurrió un error al guardar marcación.", "error"); 
        document.getElementById(btnId).disabled = false; 
    }
};

// ==========================================================================
//   5. REGISTRO DE ALMUERZO
// ==========================================================================
window.iniciarProcesoAlmuerzo = function(tipo) { 
    if(window.modoAlmuerzoGlobal === 'QR') abrirEscanerQR(tipo); 
    else abrirModalToken(tipo); 
};

window.abrirModalToken = function(tipo) {
    window.estadoAlmuerzoActual = tipo; 
    document.getElementById('input-token-almuerzo').value = ""; document.getElementById('modal-token-almuerzo').style.display = 'flex';
};

window.validarTokenYRegistrar = async function() {
    const inputToken = document.getElementById('input-token-almuerzo').value.trim();
    if(inputToken.length !== 6) return mostrarAlertaCustom("El token debe tener 6 dígitos exactos.", "warning");
    const btn = document.getElementById('btn-validar-token'); btn.disabled = true; btn.innerHTML = 'Validando...';

    try {
        const tokenSnap = await getDoc(doc(db, "configuracion", "token_seguridad"));
        if(!tokenSnap.exists() || tokenSnap.data().valor !== inputToken) { mostrarAlertaCustom("Token incorrecto.", "error"); btn.disabled = false; btn.innerHTML = 'Validar'; return; }
        const nombre = document.getElementById('dash-nombre-empleado').innerText; const cedula = document.getElementById('cedula').value; const ref = doc(db, "registros", nombre + "_" + hoyStr);
        if (window.estadoAlmuerzoActual === "SALIDA") await setDoc(ref, { nombre: nombre, fecha: hoyStr, salida: serverTimestamp(), regreso: null, cedula: cedula });
        else await updateDoc(ref, { regreso: serverTimestamp() });
        
        cerrarModal('modal-token-almuerzo'); 
        await cargarEstadoUnificadoEmpleado(nombre);
    } catch (error) { mostrarAlertaCustom("Error de conexión.", "error"); }
    btn.disabled = false; btn.innerHTML = 'Validar y Registrar';
};

let escanerActivo = null;
window.abrirEscanerQR = function(tipo) {
    window.estadoAlmuerzoActual = tipo; document.getElementById('lbl-tipo-escaner').innerText = tipo; document.getElementById('modal-escaner-qr').style.display = 'flex';
    escanerActivo = new Html5Qrcode("lector-camara-qr");
    escanerActivo.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, onEscaneoExitoso).catch((err) => { mostrarAlertaCustom("No se pudo iniciar la cámara.", "error"); });
};

window.cerrarEscanerQR = function() { if(escanerActivo) { escanerActivo.stop().then(()=>escanerActivo.clear()).catch(e=>console.log(e)); } cerrarModal('modal-escaner-qr'); };

async function onEscaneoExitoso(textoEscaneado) {
    if(escanerActivo) { await escanerActivo.stop(); escanerActivo.clear(); } document.getElementById('modal-escaner-qr').style.display = 'none';
    if (textoEscaneado !== "ITSACOURIER-ALMUERZO-" + hoyStr) return mostrarAlertaCustom("Código QR inválido o caducado.", "error");
    
    try {
        const nombre = document.getElementById('dash-nombre-empleado').innerText; const cedula = document.getElementById('cedula').value; const ref = doc(db, "registros", nombre + "_" + hoyStr);
        if (window.estadoAlmuerzoActual === "SALIDA") await setDoc(ref, { nombre: nombre, fecha: hoyStr, salida: serverTimestamp(), regreso: null, cedula: cedula });
        else await updateDoc(ref, { regreso: serverTimestamp() });
        await cargarEstadoUnificadoEmpleado(nombre);
    } catch (error) { mostrarAlertaCustom("Error al guardar.", "error"); }
}

// ==========================================================================
//   6. PANEL ADMINISTRADOR ERP
// ==========================================================================
window.abrirModalAuth = function() { document.getElementById('modal-auth-admin').style.display = 'flex'; document.getElementById('admin-password-input').value = ""; };
window.validarAdmin = async function() {
    const pass = document.getElementById('admin-password-input').value;
    const snap = await getDoc(doc(db, "configuracion", "seguridad"));
    if (snap.exists() && snap.data().adminPassword === pass) { cerrarModal('modal-auth-admin'); navegar('view-admin'); inicializarAdminERP(); } 
    else mostrarAlertaCustom("Contraseña incorrecta.", "error");
};
window.abrirModalCambiarPassword = function() { document.getElementById('modal-cambiar-password').style.display = 'flex'; document.getElementById('new-password-input').value = ""; };
window.guardarNuevaPassword = async function() {
    const nueva = document.getElementById('new-password-input').value;
    if(nueva.length < 4) return mostrarAlertaCustom("Debe tener al menos 4 caracteres.", "warning");
    await updateDoc(doc(db, "configuracion", "seguridad"), { adminPassword: nueva }); mostrarAlertaCustom("Actualizada.", "success"); cerrarModal('modal-cambiar-password');
};

window.switchAdminTab = function(tabName) {
    document.querySelectorAll('.admin-tab').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).style.display = 'block'; document.getElementById(`nav-${tabName}`).classList.add('active');
    
    const title = document.getElementById('admin-module-title');
    if(tabName === 'monitores') title.innerHTML = '<i class="fas fa-tv"></i> Monitores en Vivo';
    if(tabName === 'directorio') title.innerHTML = '<i class="fas fa-address-book"></i> Directorio de Personal';
    if(tabName === 'reportes') title.innerHTML = '<i class="fas fa-chart-line"></i> Centro de Reportes';
    if(tabName === 'config') title.innerHTML = '<i class="fas fa-cog"></i> Configuración Global';
};

async function inicializarAdminERP() {
    const snapAreas = await getDoc(doc(db, "configuracion", "areas_empresa"));
    if(snapAreas.exists()) areasDinamicas = snapAreas.data().lista || ["GENERAL"];
    dibujarAreasConfig();

    const snapAjustes = await getDoc(doc(db, "configuracion", "ajustes_sistema"));
    if(snapAjustes.exists() && snapAjustes.data().modo_almuerzo) {
        window.modoAlmuerzoGlobal = snapAjustes.data().modo_almuerzo; document.getElementById('selector-modo-almuerzo').value = window.modoAlmuerzoGlobal;
        if(window.modoAlmuerzoGlobal === 'QR') { document.getElementById('btn-header-token').style.display = 'none'; document.getElementById('btn-header-qr').style.display = 'block'; } 
        else { document.getElementById('btn-header-token').style.display = 'block'; document.getElementById('btn-header-qr').style.display = 'none'; }
    }

    await cargarDirectorio();
    await actualizarMonitores();
}

/* --- MONITORES EN VIVO --- */
window.actualizarMonitores = async function() {
    const btnRefrescar = document.querySelector('button[onclick="actualizarMonitores()"]');
    if (btnRefrescar) {
        btnRefrescar.disabled = true;
        btnRefrescar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';
    }

    try {
        const snapEmp = await getDocs(collection(db, "empleados"));
        empleadosERPGlobal = [];
        snapEmp.forEach(d => empleadosERPGlobal.push(d.data()));

        const pFmt = `${hoyStr.split('-')[2]}/${hoyStr.split('-')[1]}/${hoyStr.split('-')[0]}`; 
        const qMarc = query(collection(db, "marcaciones"), where("fecha", "==", pFmt));
        const snapM = await getDocs(qMarc); 
        marcacionesGlobales = []; 
        snapM.forEach(d => marcacionesGlobales.push(d.data()));

        const snapA = await getDocs(collection(db, "registros"));
        registrosAlmGlobales = []; 
        snapA.forEach(d => registrosAlmGlobales.push(d.data()));

        let cAsisPend = 0, cAsisTrab = 0, cAsisComp = 0; 
        document.getElementById("list-asis-pendientes").innerHTML = ""; 
        document.getElementById("list-asis-trabajando").innerHTML = ""; 
        document.getElementById("list-asis-completados").innerHTML = "";
        
        let cAlmPend = 0, cAlmTrab = 0, cAlmComp = 0; 
        document.getElementById("list-alm-pendientes").innerHTML = ""; 
        document.getElementById("list-alm-trabajando").innerHTML = ""; 
        document.getElementById("list-alm-completados").innerHTML = "";
        
        window.empleadosEnAlmuerzo = [];

        empleadosERPGlobal.sort((a,b) => a.nombres.localeCompare(b.nombres)).forEach(emp => {
            const pAsis = emp.permisoAsistencia !== false;
            const pAlm = emp.permisoAlmuerzo !== false;

            if(pAsis) {
                const recAsis = marcacionesGlobales.find(m => String(m.cedula).trim() === String(emp.cedula).trim());
                if (!recAsis) { 
                    document.getElementById("list-asis-pendientes").innerHTML += `<li><span class="nombre">${emp.nombres}</span></li>`; 
                    cAsisPend++; 
                } 
                else if (!recAsis.horaSalida) { 
                    document.getElementById("list-asis-trabajando").innerHTML += `<li><span class="nombre">${emp.nombres}</span> <span class="time-badge" style="color:var(--warning); border-color:var(--warning);"><i class="fas fa-arrow-right"></i> ${recAsis.horaEntrada}</span></li>`; 
                    cAsisTrab++; 
                } 
                else { 
                    document.getElementById("list-asis-completados").innerHTML += `<li><span class="nombre">${emp.nombres}</span> <span class="time-badge" style="color:var(--success); border-color:var(--success);"><i class="fas fa-arrow-left"></i> ${recAsis.horaSalida}</span></li>`; 
                    cAsisComp++; 
                }
            }

            if(pAlm) {
                const recAlm = registrosAlmGlobales.find(r => String(r.cedula).trim() === String(emp.cedula).trim() && r.fecha === hoyStr);
                if (!recAlm) { 
                    document.getElementById("list-alm-pendientes").innerHTML += `<li><span class="nombre">${emp.nombres}</span></li>`; 
                    cAlmPend++; 
                } 
                else if (recAlm.salida && !recAlm.regreso) { 
                    document.getElementById("list-alm-trabajando").innerHTML += `<li><span class="nombre">${emp.nombres}</span> <span class="time-badge" id="timer-${emp.cedula}">--:--</span></li>`; 
                    window.empleadosEnAlmuerzo.push({ id: emp.cedula, salidaMs: recAlm.salida.seconds * 1000 }); 
                    cAlmTrab++; 
                } 
                else if (recAlm.salida && recAlm.regreso) { 
                    document.getElementById("list-alm-completados").innerHTML += `<li><span class="nombre">${emp.nombres}</span></li>`; 
                    cAlmComp++; 
                }
            }
        });

        document.getElementById("count-asis-pendientes").innerText = cAsisPend; 
        document.getElementById("count-asis-trabajando").innerText = cAsisTrab; 
        document.getElementById("count-asis-completados").innerText = cAsisComp;

        document.getElementById("count-alm-pendientes").innerText = cAlmPend; 
        document.getElementById("count-alm-trabajando").innerText = cAlmTrab; 
        document.getElementById("count-alm-completados").innerText = cAlmComp;

        if (timerEnVivo) clearInterval(timerEnVivo);
        actualizarRelojesAlmuerzo(); 
        timerEnVivo = setInterval(actualizarRelojesAlmuerzo, 1000);

    } catch (error) {
        console.error("Error al actualizar monitores:", error);
        mostrarAlertaCustom("Error al consultar la base de datos.", "error");
    }

    if (btnRefrescar) {
        btnRefrescar.disabled = false;
        btnRefrescar.innerHTML = '<i class="fas fa-sync-alt"></i> Refrescar Monitores';
    }
};

function actualizarRelojesAlmuerzo() {
    if(!window.empleadosEnAlmuerzo) return;
    window.empleadosEnAlmuerzo.forEach(emp => {
        const el = document.getElementById(`timer-${emp.id}`);
        if(el) {
            const diffMs = Date.now() - emp.salidaMs; const restanteMs = (60 * 60 * 1000) - diffMs;
            const isExcedido = restanteMs < 0; const absRestante = Math.abs(restanteMs);
            const totalSegundos = Math.floor(absRestante / 1000); const minutos = Math.floor(totalSegundos / 60); const segundos = totalSegundos % 60;
            const sign = isExcedido ? "-" : ""; el.innerText = `${sign}${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;
            if (isExcedido) el.style.color = 'var(--danger)'; else el.style.color = 'var(--warning)';
        }
    });
}

/* --- DIRECTORIO CENTRALIZADO --- */
async function cargarDirectorio() {
    const snap = await getDocs(collection(db, "empleados"));
    empleadosERPGlobal = []; snap.forEach(d => empleadosERPGlobal.push(d.data()));
    filtrarDirectorio();
}

window.filtrarDirectorio = function() {
    const term = document.getElementById('buscar-directorio').value.toLowerCase();
    const tb = document.getElementById('tabla-directorio'); tb.innerHTML = "";
    
    empleadosERPGlobal.filter(e => e.nombres.toLowerCase().includes(term) || e.cedula.includes(term)).sort((a,b) => a.nombres.localeCompare(b.nombres)).forEach(emp => {
        let modulosHtml = [];
        if(emp.permisoAsistencia) modulosHtml.push('<i class="fas fa-fingerprint" title="Asistencia" style="color:var(--nava-cyan);"></i>');
        if(emp.permisoAlmuerzo) modulosHtml.push('<i class="fas fa-utensils" title="Almuerzos" style="color:var(--warning);"></i>');
        
        tb.innerHTML += `<tr class="notranslate" translate="no">
            <td class="notranslate" translate="no"><strong>${emp.cedula}</strong></td>
            <td class="notranslate" translate="no"><strong>${emp.nombres}</strong></td>
            <td><span class="badge-status">${emp.ciudad || 'QUITO'}</span></td>
            <td><span class="badge-status" style="border-color:var(--text-muted); color:var(--text-muted);">${emp.area || 'GENERAL'}</span></td>
            <td>${emp.celular || '-'}</td>
            <td>${modulosHtml.join(' ')}</td>
            <td style="display:flex; gap:8px;">
                <button class="btn-edit-small" onclick="abrirModalFichaEmpleado('${emp.cedula}')">Editar</button>
                <button class="btn-delete-small" onclick="eliminarEmpleadoERP('${emp.cedula}', '${emp.nombres}')">Eliminar</button>
            </td>
        </tr>`;
    });
};

window.abrirModalFichaEmpleado = function(cedula = null) {
    const selectArea = document.getElementById('ficha-area'); selectArea.innerHTML = "";
    areasDinamicas.forEach(a => selectArea.innerHTML += `<option value="${a}">${a}</option>`);

    document.getElementById('ficha-cedula').disabled = false;

    if(cedula) {
        const emp = empleadosERPGlobal.find(e => e.cedula === cedula);
        cedulaOriginalEditar = emp.cedula; 
        document.getElementById('ficha-accion').value = 'editar';
        document.getElementById('ficha-cedula').value = emp.cedula; 
        document.getElementById('ficha-celular').value = emp.celular || "";
        document.getElementById('ficha-nombres').value = emp.nombres;
        document.getElementById('ficha-ciudad').value = emp.ciudad || "QUITO";
        document.getElementById('ficha-area').value = emp.area || areasDinamicas[0];
        document.getElementById('ficha-hora').value = emp.horaIngreso || "07:30";
        document.getElementById('ficha-password').value = emp.password || "";
        document.getElementById('ficha-permiso-asis').checked = emp.permisoAsistencia;
        document.getElementById('ficha-permiso-alm').checked = emp.permisoAlmuerzo;
    } else {
        cedulaOriginalEditar = null;
        document.getElementById('ficha-accion').value = 'nuevo';
        document.getElementById('ficha-cedula').value = ""; 
        document.getElementById('ficha-celular').value = ""; 
        document.getElementById('ficha-nombres').value = "";
        document.getElementById('ficha-ciudad').value = "QUITO";
        document.getElementById('ficha-password').value = "";
        document.getElementById('ficha-permiso-asis').checked = true; 
        document.getElementById('ficha-permiso-alm').checked = true;
    }
    document.getElementById('modal-ficha-empleado').style.display = 'flex';
};

window.guardarFichaEmpleado = async function() {
    const accion = document.getElementById('ficha-accion').value;
    const cedulaNueva = document.getElementById('ficha-cedula').value.trim();
    const celular = document.getElementById('ficha-celular').value.trim();
    const nombres = document.getElementById('ficha-nombres').value.trim().toUpperCase();
    const ciudad = document.getElementById('ficha-ciudad').value.trim().toUpperCase() || "QUITO";
    const area = document.getElementById('ficha-area').value;
    const hora = document.getElementById('ficha-hora').value;
    const pwd = document.getElementById('ficha-password').value.trim();
    const pAsis = document.getElementById('ficha-permiso-asis').checked;
    const pAlm = document.getElementById('ficha-permiso-alm').checked;

    if(!cedulaNueva || !nombres) return mostrarAlertaCustom("Cédula y Nombres son obligatorios.", "warning");

    const empExisteCedula = empleadosERPGlobal.find(e => e.cedula === cedulaNueva);
    if (empExisteCedula) {
        if (accion === 'nuevo' || (accion === 'editar' && cedulaOriginalEditar !== cedulaNueva)) {
            return mostrarAlertaCustom(`Atención: La cédula ${cedulaNueva} ya está registrada a nombre de: ${empExisteCedula.nombres}. Use un número único.`, "error");
        }
    }

    const pwdEfectiva = pwd || cedulaNueva;
    const empExistePassword = empleadosERPGlobal.find(e => {
        const passOtro = e.password || e.cedula;
        const esOtroUsuario = e.cedula !== (accion === 'editar' ? cedulaOriginalEditar : cedulaNueva);
        return esOtroUsuario && passOtro === pwdEfectiva;
    });

    if (empExistePassword) {
        return mostrarAlertaCustom(`Atención: La contraseña "${pwdEfectiva}" ya la utiliza el empleado: ${empExistePassword.nombres}. Asigne una clave diferente.`, "error");
    }

    const btn = document.querySelector('#modal-ficha-empleado .btn-primary'); 
    btn.disabled = true; 
    btn.innerText = "Guardando...";
    
    try {
        const data = { cedula: cedulaNueva, celular: celular, nombres: nombres, ciudad: ciudad, area: area, horaIngreso: hora, password: pwdEfectiva, permisoAsistencia: pAsis, permisoAlmuerzo: pAlm };
        
        if (accion === 'editar' && cedulaOriginalEditar && cedulaOriginalEditar !== cedulaNueva) {
            await deleteDoc(doc(db, "empleados", cedulaOriginalEditar));
        }

        await setDoc(doc(db, "empleados", cedulaNueva), data);
        
        mostrarAlertaCustom(`Empleado ${nombres} guardado con éxito.`, "success"); 
        cerrarModal('modal-ficha-empleado'); 
        await cargarDirectorio();
        await actualizarMonitores();
    } catch(e) { 
        console.error("Error al guardar empleado:", e);
        mostrarAlertaCustom("Error al guardar datos.", "error"); 
    }
    btn.disabled = false; 
    btn.innerText = "Guardar Empleado";
};

window.eliminarEmpleadoERP = function(cedula, nombre) {
    mostrarConfirmacionCustom(`¿Eliminar permanentemente a ${nombre}?`, async () => {
        try { await deleteDoc(doc(db, "empleados", cedula)); mostrarAlertaCustom("Eliminado.", "success"); await cargarDirectorio(); await actualizarMonitores(); } 
        catch(e) { mostrarAlertaCustom("Error.", "error"); }
    }, true);
};

/* --- CORRECCIÓN DE MARCACIONES --- */
window.abrirModalCorreccion = function() { 
    document.getElementById('modal-corregir-bio').style.display = 'flex'; 
    document.getElementById('fecha-corregir').value = new Date().toLocaleDateString('en-CA'); 
    buscarMarcacionesParaCorregirAdmin(); 
};

window.buscarMarcacionesParaCorregirAdmin = async function() {
    const fechaInput = document.getElementById('fecha-corregir').value; if(!fechaInput) return;
    const partes = fechaInput.split('-'); const fechaBuscada = `${partes[2]}/${partes[1]}/${partes[0]}`;
    const tbody = document.getElementById('tabla-correccion-bio'); tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Buscando...</td></tr>';
    
    try {
        const q = query(collection(db, "marcaciones"), where("fecha", "==", fechaBuscada)); 
        const querySnapshot = await getDocs(q); 
        tbody.innerHTML = "";
        
        if(querySnapshot.empty) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Sin registros en la fecha seleccionada.</td></tr>'; return; }
        
        querySnapshot.forEach(d => {
            const info = d.data(); const idDoc = d.id; const tieneSalida = !!info.horaSalida; 
            tbody.innerHTML += `<tr>
                <td><strong>${info.nombre}</strong><br><span style="font-size:11px; color:var(--text-muted);">C.C. ${info.cedula}</span></td>
                <td style="color:var(--success); font-weight:600;"><i class="fas fa-arrow-right"></i> ${info.horaEntrada || '-'}</td>
                <td style="color:var(--nava-cyan); font-weight:600;"><i class="fas fa-arrow-left"></i> ${info.horaSalida || '-'}</td>
                <td><span class="badge-status">${info.estado}</span></td>
                <td style="display:flex; gap:8px;">
                    ${tieneSalida ? `<button class="btn-delete-small btn-delete-wide" style="background:rgba(255,234,0,0.1); color:var(--warning); border-color:var(--warning);" onclick="eliminarSoloSalida('${idDoc}', '${info.nombre}')">Borrar Salida</button>` : ''}
                    <button class="btn-delete-small btn-delete-wide" onclick="eliminarMarcacionErronea('${idDoc}', '${info.nombre}')">Borrar Entrada</button>
                </td>
            </tr>`;
        });
    } catch(e) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--danger);">Error al cargar.</td></tr>'; }
};

window.eliminarSoloSalida = function(idDocumento, nombre) {
    mostrarConfirmacionCustom(`¿Eliminar SALIDA de ${nombre}?`, async () => {
        try {
            await updateDoc(doc(db, "marcaciones", idDocumento), { horaSalida: deleteField(), tiempoTrabajado: deleteField(), horasExtras: deleteField(), ubicacionSalida: deleteField(), enlaceGoogleMapsSalida: deleteField(), estado: "Trabajando" });
            mostrarAlertaCustom("Salida eliminada.", 'success'); buscarMarcacionesParaCorregirAdmin(); 
            actualizarMonitores();
        } catch(e) { mostrarAlertaCustom("Error.", 'error'); }
    }, false);
};

window.eliminarMarcacionErronea = function(idDocumento, nombre) {
    mostrarConfirmacionCustom(`¿Borrar ENTRADA Y SALIDA de ${nombre}?`, async () => {
        try { 
            await deleteDoc(doc(db, "marcaciones", idDocumento)); 
            mostrarAlertaCustom("Jornada eliminada.", 'success'); 
            buscarMarcacionesParaCorregirAdmin(); 
            actualizarMonitores();
        } catch(e) { mostrarAlertaCustom("Error.", 'error'); }
    }, true);
};

/* --- REPORTES UNIFICADOS --- */
window.generarReporteCentralizado = async function() {
    const dIni = document.getElementById('rep-inicio').value; const dFin = document.getElementById('rep-fin').value; const tipo = document.getElementById('rep-tipo').value;
    if(!dIni || !dFin) return mostrarAlertaCustom("Seleccione un rango de fechas.", "warning");
    
    const btn = document.querySelector('button[onclick="generarReporteCentralizado()"]'); btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';
    
    try {
        const fechaInObj = new Date(dIni + 'T00:00:00'); const fechaFinObj = new Date(dFin + 'T23:59:59');
        let datosExportar = [];

        const snapEmp = await getDocs(collection(db, "empleados"));
        let mapaEmpleados = {};
        snapEmp.forEach(docE => { const dataE = docE.data(); mapaEmpleados[dataE.cedula] = dataE; });

        if (tipo === "ASISTENCIA") {
            const snap = await getDocs(collection(db, "marcaciones"));
            snap.forEach(docSnap => {
                const d = docSnap.data(); const fDoc = parseFechaExcel(d.fecha);
                if(fDoc >= fechaInObj && fDoc <= fechaFinObj) {
                    const empInfo = mapaEmpleados[d.cedula] || {};
                    datosExportar.push({ 
                        "Fecha": fDoc, 
                        "Cédula": d.cedula, 
                        "Nombre": d.nombre, 
                        "Ciudad": empInfo.ciudad || d.ciudad || "-",
                        "Área": empInfo.area || "GENERAL", 
                        "Entrada": d.horaEntrada||"-", 
                        "Atraso": d.atraso||"-", 
                        "Salida": d.horaSalida||"-", 
                        "Trabajado": d.tiempoTrabajado||"-", 
                        "Horas Extras": d.horasExtras||"-" 
                    });
                }
            });
        } else if (tipo === "ALMUERZOS") {
            const snap = await getDocs(collection(db, "registros"));
            snap.forEach(docSnap => {
                const d = docSnap.data(); const fDoc = new Date(d.fecha + 'T12:00:00');
                if(fDoc >= fechaInObj && fDoc <= fechaFinObj) {
                    const empInfo = mapaEmpleados[d.cedula] || {};
                    const sal = d.salida ? new Date(d.salida.seconds * 1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : "-";
                    const reg = d.regreso ? new Date(d.regreso.seconds * 1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : "-";
                    let usado = "-", exc = "A tiempo";
                    if(d.salida && d.regreso) { const m = Math.floor(((d.regreso.seconds - d.salida.seconds)*1000)/60000); usado = formatoHorasMinutos(m); if(m>60) exc = formatoHorasMinutos(m-60); }
                    datosExportar.push({ 
                        "Fecha": fDoc, 
                        "Cédula": d.cedula, 
                        "Nombre": d.nombre, 
                        "Área": empInfo.area || "GENERAL",
                        "Salida": sal, 
                        "Retorno": reg, 
                        "Tiempo Total": usado, 
                        "Excedido": exc 
                    });
                }
            });
        }

        if(datosExportar.length === 0) { mostrarAlertaCustom("No hay registros en esas fechas.", "warning"); btn.disabled = false; btn.innerHTML = '<i class="fas fa-file-excel"></i> Generar Excel'; return; }

        const hoja = XLSX.utils.json_to_sheet(datosExportar, { cellDates: true }); const libro = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(libro, hoja, tipo); XLSX.writeFile(libro, `Reporte_ITSACOURIER_${tipo}.xlsx`);
    } catch(e) { console.error(e); mostrarAlertaCustom("Error al generar Excel.", "error"); }
    
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-file-excel"></i> Generar Excel';
};

/* --- CONFIGURACIÓN GLOBAL --- */
window.cambiarModoAlmuerzoAdmin = async function() {
    const modoSeleccionado = document.getElementById('selector-modo-almuerzo').value;
    const btnToken = document.getElementById('btn-header-token'); const btnQr = document.getElementById('btn-header-qr');
    if(modoSeleccionado === 'QR') { btnToken.style.display = 'none'; btnQr.style.display = 'block'; } else { btnToken.style.display = 'block'; btnQr.style.display = 'none'; }
    try { await setDoc(doc(db, "configuracion", "ajustes_sistema"), { modo_almuerzo: modoSeleccionado }, { merge: true }); mostrarAlertaCustom(`Validación cambiada a: ${modoSeleccionado}.`, "success"); } catch(e) {}
};

window.abrirModalImprimirQR = function() {
    document.getElementById('modal-imprimir-qr').style.display = 'flex'; document.getElementById('lbl-fecha-qr').innerText = hoyStr; 
    const contenedor = document.getElementById('contenedor-qr-imprimir'); contenedor.innerHTML = ""; 
    const codigoQRGenerado = new QRCode(contenedor, { text: "ITSACOURIER-ALMUERZO-" + hoyStr, width: 250, height: 250, colorDark : "#000000", colorLight : "#ffffff", correctLevel : QRCode.CorrectLevel.H });
};

window.ejecutarImpresionQR = function() {
    const canvas = document.getElementById("contenedor-qr-imprimir").querySelector("canvas");
    if (canvas) {
        let ventana = window.open('', '_blank', 'width=800,height=800');
        ventana.document.write(`<html><head><title>QR Almuerzo ITSACOURIER</title></head><body style="text-align: center; font-family: sans-serif; padding-top: 50px;"><h1 style="font-size: 30px; margin-bottom: 5px;">CONTROL DE ALMUERZO</h1><p style="font-size: 18px; color: #555; margin-bottom: 30px;">Válido para la fecha: <strong>${hoyStr}</strong></p><img src="${canvas.toDataURL("image/png")}" style="width: 400px; height: 400px; border: 2px solid #000; padding: 20px; border-radius: 10px;" /><p style="margin-top: 30px; font-weight: bold;">Escanea este código desde tu celular.</p></body></html>`);
        ventana.document.close(); setTimeout(() => { ventana.focus(); ventana.print(); ventana.close(); cerrarModal('modal-imprimir-qr'); }, 500);
    }
};

function dibujarAreasConfig() {
    const lista = document.getElementById('lista-areas-config'); lista.innerHTML = "";
    areasDinamicas.forEach((a, i) => {
        lista.innerHTML += `<li style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:10px 15px; border-radius:8px;"><span style="font-weight:bold; color:var(--text-main);">${a}</span> <button class="btn-delete-small" style="padding:4px 8px;" onclick="eliminarAreaERP(${i})">Borrar</button></li>`;
    });
}

window.agregarAreaERP = async function() {
    const nv = document.getElementById('nueva-area-input').value.trim().toUpperCase();
    if(!nv) return; if(areasDinamicas.includes(nv)) return mostrarAlertaCustom("El área ya existe.", "warning");
    areasDinamicas.push(nv); document.getElementById('nueva-area-input').value = "";
    try { await setDoc(doc(db, "configuracion", "areas_empresa"), { lista: areasDinamicas }); dibujarAreasConfig(); } catch(e) { mostrarAlertaCustom("Error guardando área.", "error"); }
};

window.eliminarAreaERP = function(index) {
    mostrarConfirmacionCustom(`¿Eliminar el área ${areasDinamicas[index]}?`, async () => {
        areasDinamicas.splice(index, 1);
        try { await setDoc(doc(db, "configuracion", "areas_empresa"), { lista: areasDinamicas }); dibujarAreasConfig(); } catch(e) {}
    }, true);
};