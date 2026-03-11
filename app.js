// --- Configuración de Google Drive ---
// PEGA AQUÍ LA URL QUE TE DIO GOOGLE APPS SCRIPT DENTRO DE LAS COMILLAS
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxLhRtrNcd4xRwIqf64gg_QWi82SRTpZt5SQj6_N2Zp0zSLhplvzuzTVdMtAmMfdpqA/exec";

// --- Estado Local ---
let state = {
    tasks: [],
    expenses: [
        { id: 1, type: "RECARGA MENSUAL", amount: 50.00, process: 3000.00, status: "Pendiente" },
        { id: 2, type: "GASOLINA", amount: 300.00, process: 1000.00, status: "Pendiente" },
        { id: 3, type: "CAJITA DE INTERNET", amount: 1128.50, process: 3000.00, status: "Pendiente" },
        { id: 4, type: "LUZ", amount: 2000.00, process: 0.00, status: "Pendiente" },
        { id: 5, type: "UNIVERSIDAD", amount: 2355.00, process: 0.00, status: "Pendiente" },
        { id: 6, type: "GYM", amount: 1200.00, process: 0.00, status: "Pendiente" }
    ],
    people: [
        { id: 1, matricula: "10034", name: "Adrián", nextDate: "2026-03-07", taskCount: "", lastPayment: "", observation: "" },
        { id: 2, matricula: "10034/105", name: "SURELY", nextDate: "2026-03-09", taskCount: "", lastPayment: "", observation: "" },
        { id: 3, matricula: "100059065", name: "Ana", nextDate: "2026-03-06", taskCount: "", lastPayment: "", observation: "" }
    ],
    goal: 100,
    currentMonth: new Date().getMonth() + 1 // 1-12
};

let editingTaskId = null; // Para editar tareas

// --- Runtime UI State ---
let filterState = {
    sortCol: null,
    sortDir: null,
    activePopupCol: null,
    checkboxesStatus: {
        matricula: null,
        name: null,
        nextDate: null
    }
};

// --- Configuración Inicial e Inicialización ---
const init = async () => {
    try {
        // Intentar cargar de localStorage de forma segura
        const savedData = localStorage.getItem('sistemaTareasData');
        if (savedData) {
            const parsed = JSON.parse(savedData);
            // Hacer un merge seguro para no perder propiedades nuevas si el localstorage es viejo
            state.tasks = parsed.tasks || [];
            state.expenses = parsed.expenses || state.expenses;
            state.people = parsed.people || state.people;
            state.goal = parsed.goal || state.goal;
            state.currentMonth = parsed.currentMonth || state.currentMonth;
        }
    } catch (err) {
        console.error("Error cargando localStorage, usando state por defecto:", err);
    }

    try {
        // Configurar Fecha del Header
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        document.getElementById('currentDateDisplay').textContent = new Date().toLocaleDateString('es-ES', dateOptions);

        // Setear mes en el dropdown
        const monthSelector = document.getElementById('monthSelector');
        if (monthSelector) monthSelector.value = state.currentMonth;
        const tasksGoal = document.getElementById('tasksGoal');
        if (tasksGoal) tasksGoal.value = state.goal;

        // Renderizar
        renderAll();

        // Event Listeners principales
        setupEventListeners();
        setupPeopleFilters();
    } catch (err) {
        console.error("Error fatal en el renderizado inicial:", err);
    }

    try {
        // Sincronizar con Google Drive si la URL está configurada
        if (WEB_APP_URL) {
            await loadFromCloud();
        }
    } catch (err) {
        console.error("Error al iniciar Google Drive:", err);
    }
};

const saveData = () => {
    localStorage.setItem('sistemaTareasData', JSON.stringify(state));
    calculateSummary();

    if (WEB_APP_URL) {
        syncToCloud();
    }
};

const syncToCloud = () => {
    const statusEl = document.getElementById('syncStatus');
    statusEl.className = 'sync-status sync-loading';
    statusEl.innerHTML = '<i data-lucide="refresh-cw"></i> Guardando...';
    lucide.createIcons();

    // Eliminar script anterior si existe
    const oldScript = document.getElementById('jsonp-sync');
    if (oldScript) oldScript.remove();

    // Convertir estado a string codificado
    const jsonData = JSON.stringify(state);
    const payload = encodeURIComponent(jsonData);

    // Si la URL es muy larga (más de 2000 caracteres), el método GET por script.src fallará
    // Preferimos usar fetch con POST como la vía principal ya que los datos de la app crecen
    fetch(WEB_APP_URL, {
        method: 'POST',
        // mode: 'no-cors' limits our ability to read response, but we send it anyway
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `action=save&data=${payload}`
    })
        .then(response => {
            // En modo cors normal leeríamos esto, si Apps Script lo permite
            window.handleDriveSyncResponse({ success: true });
        })
        .catch(err => {
            console.error("Error en POST sync (puede ser CORS normal):", err);
            // Fallback a JSONP si Fetch falla totalmente
            const script = document.createElement('script');
            script.src = `${WEB_APP_URL}?action=save&data=${payload}&callback=handleDriveSyncResponse`;
            script.id = 'jsonp-sync';
            script.onerror = () => {
                window.handleDriveSyncResponse({ success: false });
            };
            document.body.appendChild(script);
        });
};

// Callback Global para Guardado
window.handleDriveSyncResponse = function (response) {
    const statusEl = document.getElementById('syncStatus');
    if (response && response.success) {
        statusEl.className = 'sync-status sync-success';
        statusEl.innerHTML = '<i data-lucide="cloud-check"></i> Sincronizado';
    } else {
        statusEl.className = 'sync-status sync-error';
        statusEl.innerHTML = '<i data-lucide="cloud-off"></i> Error al guardar';
    }
    lucide.createIcons();
};

const loadFromCloud = () => {
    return new Promise((resolve) => {
        const statusEl = document.getElementById('syncStatus');
        statusEl.className = 'sync-status sync-loading';
        statusEl.innerHTML = '<i data-lucide="refresh-cw"></i> Descargando...';
        lucide.createIcons();

        // Timeout proxy
        const timeout = setTimeout(() => {
            if (statusEl.className.includes('sync-loading')) {
                statusEl.className = 'sync-status sync-error';
                statusEl.innerHTML = '<i data-lucide="cloud-off"></i> Fallo de conexión (Timeout)';
                lucide.createIcons();
            }
            resolve();
        }, 15000); // Aumentado a 15 segundos permitiendo respuestas lentas de Apps Script

        // Evitar múltiples llamadas simultáneas
        if (window.isSyncing) return resolve();
        window.isSyncing = true;

        // Callback Global para Carga
        window.handleDriveLoadResponse = function (data) {
            window.isSyncing = false;
            clearTimeout(timeout);
            try {
                if (data && data.tasks) {
                    // Merge data carefully so we don't lose local defaults if Drive file is newly created
                    state.tasks = data.tasks || [];
                    if (data.expenses && data.expenses.length > 0) state.expenses = data.expenses;
                    if (data.people && data.people.length > 0) state.people = data.people;
                    if (data.goal) state.goal = data.goal;
                    if (data.currentMonth) state.currentMonth = data.currentMonth;

                    localStorage.setItem('sistemaTareasData', JSON.stringify(state));
                    const monthSelector = document.getElementById('monthSelector');
                    if (monthSelector) monthSelector.value = state.currentMonth;
                    const tasksGoal = document.getElementById('tasksGoal');
                    if (tasksGoal) tasksGoal.value = state.goal;

                    renderAll();

                    statusEl.className = 'sync-status sync-success';
                    statusEl.innerHTML = '<i data-lucide="cloud-check"></i> Drive Conectado';
                } else if (data && data.empty) {
                    // Si Drive responde que está vacío, empujamos los datos locales para inicializarlo
                    statusEl.className = 'sync-status sync-loading';
                    statusEl.innerHTML = '<i data-lucide="refresh-cw"></i> Configurando Drive...';
                    syncToCloud();
                } else {
                    statusEl.className = 'sync-status sync-error';
                    statusEl.innerHTML = '<i data-lucide="cloud-off"></i> Info vacía';
                }
            } catch (err) {
                console.error("Error procesando respuesta de Drive:", err);
                statusEl.className = 'sync-status sync-error';
                statusEl.innerHTML = '<i data-lucide="alert-circle"></i> Error de formato';
            }
            lucide.createIcons();
            resolve();
        };

        const script = document.createElement('script');
        script.src = `${WEB_APP_URL}?action=load&callback=handleDriveLoadResponse`;
        script.onerror = () => {
            clearTimeout(timeout);
            statusEl.className = 'sync-status sync-error';
            statusEl.innerHTML = '<i data-lucide="cloud-off"></i> Usando datos locales';
            lucide.createIcons();
            resolve();
        };
        document.body.appendChild(script);
    });
};

const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount) || 0);
};

// --- Renderizadores ---
const renderAll = () => {
    renderExpenses();
    renderPeople();
    calculateSummary();
};

const renderExpenses = () => {
    const tbody = document.querySelector('#expensesTable tbody');
    tbody.innerHTML = '';

    state.expenses.forEach((exp, index) => {
        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td>${index + 1}</td>
            <td><input type="text" class="table-input expense-type" data-id="${exp.id}" value="${exp.type}"></td>
            <td><input type="number" step="0.01" class="table-input expense-amount" data-id="${exp.id}" value="${exp.amount}"></td>
            <td style="font-weight: 600; color: ${exp.status === 'Pagado' ? 'var(--success)' : 'var(--text-main)'}; padding-left: 0.5rem;">
                ${formatCurrency(exp.process || 0)}
            </td>
            <td>
                <span class="status-badge ${exp.status === 'Pagado' ? 'status-paid' : 'status-pending'}" style="cursor: default;">
                    ${exp.status} ${exp.status === 'Pagado' ? '✓' : '✗'}
                </span>
            </td>
            <td><button class="btn btn-delete btn-sm" data-id="${exp.id}"><i data-lucide="trash-2"></i></button></td>
        `;
        tbody.appendChild(tr);
    });

    lucide.createIcons();
};

const renderPeople = () => {
    const tbody = document.querySelector('#peopleTable tbody');
    tbody.innerHTML = '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let peopleToRender = [...state.people];

    // 1. Filtrar
    ['matricula', 'name', 'nextDate'].forEach(col => {
        if (filterState.checkboxesStatus[col] !== null) {
            const allowed = new Set(filterState.checkboxesStatus[col]);
            peopleToRender = peopleToRender.filter(p => allowed.has(p[col] || ''));
        }
    });

    // 2. Ordenar
    if (filterState.sortCol) {
        peopleToRender.sort((a, b) => {
            const valA = (a[filterState.sortCol] || '').toLowerCase();
            const valB = (b[filterState.sortCol] || '').toLowerCase();
            if (valA < valB) return filterState.sortDir === 'asc' ? -1 : 1;
            if (valA > valB) return filterState.sortDir === 'asc' ? 1 : -1;
            return 0;
        });
    }

    // --- Poblar Datalist de Nombres ---
    const datalist = document.getElementById('peopleNamesList');
    if (datalist) {
        // Collect unique names
        const uniqueNames = [...new Set(state.people.map(p => p.name))].filter(n => n && n.trim() !== '');
        uniqueNames.sort((a, b) => a.localeCompare(b));

        let datalistHTML = '';
        uniqueNames.forEach(name => {
            datalistHTML += `<option value="${name}">`;
        });
        datalist.innerHTML = datalistHTML;
    }

    peopleToRender.forEach(person => {
        let dateClass = "date-status-safe";
        let trClass = "";

        if (person.nextDate) {
            const [y, m, d] = person.nextDate.split('-');
            const localNextDate = new Date(y, m - 1, d);
            localNextDate.setHours(0, 0, 0, 0);

            const diffTime = localNextDate - today;
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays <= 3 && diffDays > 0) {
                dateClass = "date-status-danger"; // Pronto a vencer
            } else if (diffDays <= 0) {
                dateClass = "date-status-danger";
                trClass = "row-danger"; // Venció o es hoy! (Máxima prioridad)
            }
        }

        const dateStr = person.nextDate ? new Date(person.nextDate).toLocaleDateString('es-ES') : '';

        const tr = document.createElement('tr');
        if (trClass) tr.className = trClass;
        tr.innerHTML = `
            <td><input type="text" class="table-input person-mat" data-id="${person.id}" value="${person.matricula}"></td>
            <td><input type="text" class="table-input person-name" data-id="${person.id}" value="${person.name}"></td>
            <td class="${dateClass}">
                <input type="date" class="table-input person-date" data-id="${person.id}" value="${person.nextDate}">
            </td>
            <td><input type="text" class="table-input person-obs" data-id="${person.id}" value="${person.observation}"></td>
            <td><button class="btn btn-delete btn-sm" data-id="${person.id}"><i data-lucide="trash-2"></i></button></td>
        `;
        tbody.appendChild(tr);
    });

    lucide.createIcons();
    attachPeopleEvents();
};

// --- Cálculos Matemáticos ---
const autoAllocateExpenses = (totalIncomeAvailable) => {
    let remainingIncome = totalIncomeAvailable;

    state.expenses.forEach(exp => {
        const amountRequired = parseFloat(exp.amount || 0);

        if (remainingIncome >= amountRequired) {
            // Can fully cover this expense
            exp.process = amountRequired;
            exp.status = "Pagado";
            remainingIncome -= amountRequired;
        } else if (remainingIncome > 0) {
            // Can partially cover this expense
            exp.process = remainingIncome;
            exp.status = "Pendiente";
            remainingIncome = 0;
        } else {
            // No income left for this expense
            exp.process = 0;
            exp.status = "Pendiente";
        }
    });
};

const calculateSummary = () => {
    const totalTareasGlobal = state.tasks.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
    document.getElementById('totalBilledAmount').textContent = formatCurrency(totalTareasGlobal);

    // Calcular el total de DINERO REAL que ha ingresado (Suma de todos los pagos)
    let totalRealIncome = 0;
    state.people.forEach(p => {
        if (Array.isArray(p.payments)) {
            totalRealIncome += p.payments.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);
        } else {
            totalRealIncome += parseFloat(p.lastPayment || 0);
        }
    });

    // Auto-completar los gastos basados en el ingreso real
    autoAllocateExpenses(totalRealIncome);

    // Renderizar la tabla de gastos nuevamente para reflejar los cambios
    // NOTA: Para no entrar en un bucle infinito si calculateSummary se llama desde renderAll, 
    // solo actualizaremos los DOM elements si ya están renderizados, o dejamos que renderAll lo maneje.
    // Como saveData llama a calculateSummary, es mejor volver a renderizar los gastos de manera segura.
    if (document.querySelector('#expensesTable tbody').children.length > 0) {
        // En lugar de llamar a renderExpenses() completo y perder el foco en inputs, actualizaremos los totales de la tabla
        state.expenses.forEach(exp => {
            const trs = document.querySelectorAll('#expensesTable tbody tr');
            trs.forEach(tr => {
                const typeInput = tr.querySelector('.expense-type');
                if (typeInput && parseInt(typeInput.dataset.id) === exp.id) {
                    const processTd = tr.children[3]; // 4th column
                    const statusSpan = tr.querySelector('.status-badge');

                    if (processTd && statusSpan) {
                        processTd.innerHTML = formatCurrency(exp.process || 0);
                        processTd.style.color = exp.status === 'Pagado' ? 'var(--success)' : 'var(--text-main)';

                        statusSpan.className = `status-badge ${exp.status === 'Pagado' ? 'status-paid' : 'status-pending'}`;
                        statusSpan.innerHTML = `${exp.status} ${exp.status === 'Pagado' ? '✓' : '✗'}`;
                    }
                }
            });
        });
    }

    const totalGastos = state.expenses.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);
    document.getElementById('totalExpenses').textContent = formatCurrency(totalGastos);

    // Ganancia Generada Mensual = Total de ingreso real cobrado
    const gananciaGeneradaMensual = totalRealIncome;
    document.getElementById('monthlyGenerated').textContent = formatCurrency(gananciaGeneradaMensual);

    // Ganancia Pagada Mensual = Total tareas registradas (lo que deberían pagar)
    const gananciaPagadaMensual = totalTareasGlobal;
    document.getElementById('monthlyPaid').textContent = formatCurrency(gananciaPagadaMensual);

    const totalDiferencia = gananciaGeneradaMensual - totalGastos;
    const diffEl = document.getElementById('totalDifference');
    diffEl.textContent = formatCurrency(totalDiferencia);
    diffEl.parentElement.className = totalDiferencia >= 0 ? 'metric-card success' : 'metric-card danger';

    // Annual (mensual * 12 or sum of all months)
    const gananciaAnual = gananciaGeneradaMensual * 12; // Simple projection
    document.getElementById('annualGenerated').textContent = formatCurrency(gananciaAnual);

    // Meta Progress
    const meta = parseFloat(state.goal) || 1;
    const cumplido = state.tasks.length;
    let porcentaje = Math.min((cumplido / meta) * 100, 100);

    document.getElementById('goalProgressBar').style.width = porcentaje + '%';
    document.getElementById('goalProgressBar').textContent = Math.round(porcentaje) + '%';

    // Calcular y renderizar Top 5 Pagadores Totales
    const topPayersBody = document.getElementById('topPayersBody');
    if (topPayersBody) {
        // Obtenemos los totales por persona basándonos en su property 'payments' (array) y 'lastPayment' antiguo
        const payers = state.people.map(p => {
            let total = 0;
            if (Array.isArray(p.payments)) {
                total = p.payments.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);
            } else {
                total = parseFloat(p.lastPayment || 0); // fallback legacy
            }
            return { name: p.name, total: total };
        }).filter(p => p.total > 0); // Solo los que han pagado algo

        // Ordenamos descendentemente
        payers.sort((a, b) => b.total - a.total);

        // Tomamos el top 5
        const top5 = payers.slice(0, 5);

        if (top5.length > 0) {
            let html = '';
            top5.forEach((p, index) => {
                const medalColor = index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : index === 2 ? '#CD7F32' : 'var(--text-muted)';
                html += `
                    <tr>
                        <td class="text-center"><i data-lucide="${index < 3 ? 'medal' : 'minus'}" style="width:16px; height:16px; color: ${medalColor}"></i><span style="display:none;">${index + 1}</span></td>
                        <td style="font-weight: 500;">${p.name.length > 20 ? p.name.substring(0, 20) + '...' : p.name}</td>
                        <td class="text-right text-success" style="font-weight: 600;">${formatCurrency(p.total)}</td>
                    </tr>
                `;
            });
            topPayersBody.innerHTML = html;
        } else {
            topPayersBody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Aún no hay pagos registrados.</td></tr>';
        }
    }

    // Calcular y renderizar Deudores (Pendientes de Pago)
    const pendingBalancesBody = document.getElementById('pendingBalancesBody');
    if (pendingBalancesBody) {
        const normalizeString = (str) => {
            if (!str) return '';
            return str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
        };

        // 1. Crear grupos canónicos basados en las personas existentes
        const canonicalGroups = {}; // Key: normalized, Value: { nameDisplay, totalPaid, matricula }

        state.people.forEach(p => {
            const normalized = normalizeString(p.name);
            if (!normalized) return;

            // Buscar si ya existe un grupo que sea subcadena o supercadena (ej. "Ana" y "Ana Martinez")
            let foundKey = Object.keys(canonicalGroups).find(k => 
                normalized.includes(k) || k.includes(normalized)
            );

            const pPaid = Array.isArray(p.payments) 
                ? p.payments.reduce((s, pay) => s + parseFloat(pay.amount), 0) 
                : parseFloat(p.lastPayment || 0);

            if (foundKey) {
                // Si el nombre nuevo es más largo, lo usamos como display principal (más descriptivo)
                if (p.name.length > canonicalGroups[foundKey].nameDisplay.length) {
                    canonicalGroups[foundKey].nameDisplay = p.name;
                }
                canonicalGroups[foundKey].totalPaid += pPaid;
                if (!canonicalGroups[foundKey].matricula && p.matricula) canonicalGroups[foundKey].matricula = p.matricula;
            } else {
                canonicalGroups[normalized] = {
                    nameDisplay: p.name,
                    totalPaid: pPaid,
                    matricula: p.matricula
                };
            }
        });

        // 2. Agrupar tareas y calcular deudas usando los grupos canónicos
        const debtorsMap = {}; // Key: groupKey, Value: { nameDisplay, taskTotal, paidTotal, matricula }

        state.tasks.forEach(t => {
            if (!t.name) return;
            const normTaskName = normalizeString(t.name);

            // Encontrar el mejor grupo canónico para esta tarea
            let bestKey = Object.keys(canonicalGroups).find(k => 
                normTaskName.includes(k) || k.includes(normTaskName)
            );

            if (!bestKey) {
                // Si la persona no está en la lista de personas, creamos un grupo temporal
                bestKey = normTaskName;
                if (!debtorsMap[bestKey]) {
                    debtorsMap[bestKey] = { nameDisplay: t.name, taskTotal: 0, paidTotal: 0, matricula: '' };
                }
            } else if (!debtorsMap[bestKey]) {
                const group = canonicalGroups[bestKey];
                debtorsMap[bestKey] = {
                    nameDisplay: group.nameDisplay,
                    taskTotal: 0,
                    paidTotal: group.totalPaid,
                    matricula: group.matricula
                };
            }
            debtorsMap[bestKey].taskTotal += parseFloat(t.amount || 0);
        });

        // 3. Crear lista de deudores con balance positivo
        const debtors = [];
        for (const [key, data] of Object.entries(debtorsMap)) {
            const pending = data.taskTotal - data.paidTotal;
            if (pending > 0) {
                debtors.push({ ...data, pending });
            }
        }

        // Ordenar mayor a menor deuda
        debtors.sort((a, b) => b.pending - a.pending);

        if (debtors.length > 0) {
            let html = '';
            debtors.forEach(d => {
                html += `
                    <tr>
                        <td style="font-weight: 500;">${d.nameDisplay.length > 20 ? d.nameDisplay.substring(0, 20) + '...' : d.nameDisplay}</td>
                        <td class="text-right text-danger" style="font-weight: 600;">${formatCurrency(d.pending)}</td>
                        <td class="text-center">
                             <button class="btn btn-outline btn-sm print-debtor-btn" 
                                     data-name="${d.nameDisplay}" 
                                     data-mat="${d.matricula}"
                                     data-total="${d.taskTotal}"
                                     data-paid="${d.paidTotal}"
                                     data-pending="${d.pending}"
                                     style="padding: 0.3rem; border-color: var(--primary); color: var(--primary);" 
                                     title="Imprimir Factura">
                                 <i data-lucide="printer"></i>
                             </button>
                        </td>
                    </tr>
                `;
            });
            pendingBalancesBody.innerHTML = html;
        } else {
            pendingBalancesBody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No hay deudas pendientes. ¡Genial!</td></tr>';
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
};

// --- Helper Func para Recibos ---
const generatePDFReceipt = (clientName, matDisplay, totalGen, totalAbonado, totalPendiente, queryNameForHistory) => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Configuración visual del PDF
    const margin = 15;
    let yPos = margin;

    // Título del Documento
    doc.setFontSize(20);
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.text("RECIBO DE TAREAS", margin, yPos);
    yPos += 10;

    // Fecha de emisión
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    const dateNow = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.text(`Fecha de emisión: ${dateNow}`, margin, yPos);
    yPos += 15;

    // Datos del Emisor (El Usuario)
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.text("EMITIDO POR:", margin, yPos);
    yPos += 7;

    doc.setFont("helvetica", "normal");
    doc.text("Adrian Smith", margin, yPos);
    yPos += 6;
    doc.text("Teléfono: 1 809 787 0813", margin, yPos);
    yPos += 12;

    // Datos del Cliente
    doc.setFont("helvetica", "bold");
    doc.text("DATOS DEL ESTUDIANTE / CLIENTE", margin, yPos);
    yPos += 7;

    doc.setFont("helvetica", "normal");
    doc.text(`Nombre: ${clientName}`, margin, yPos);
    yPos += 6;
    if (matDisplay && matDisplay.trim() !== '' && matDisplay !== '(Sin Matrícula)') {
        doc.text(`Matrícula: ${matDisplay}`, margin, yPos);
        yPos += 6;
    }
    yPos += 10;

    // Func para normalizar
    const normalizeString = (str) => {
        return str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
    };
    const searchTarget = normalizeString(queryNameForHistory);

    // Extraer historial de `state.tasks`
    const rows = [];
    const sortedTasks = [...state.tasks].sort((a, b) => new Date(b.date) - new Date(a.date));
    sortedTasks.forEach(t => {
        if (normalizeString(t.name).includes(searchTarget)) {
            const dStr = t.date ? new Date(t.date).toLocaleDateString('es-ES') : '';
            rows.push([
                dStr,
                t.assignment,
                formatCurrency(parseFloat(t.amount || 0))
            ]);
        }
    });

    // Generar Tabla con AutoTable
    if (rows.length > 0) {
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("HISTORIAL DE TAREAS", margin, yPos);
        yPos += 5;

        doc.autoTable({
            startY: yPos,
            head: [['FECHA', 'DESCRIPCIÓN DE LA ASIGNACIÓN', 'MONTO']],
            body: rows,
            theme: 'striped',
            headStyles: { fillColor: [43, 76, 126], textColor: 255 },
            styles: { font: 'helvetica', fontSize: 10, cellPadding: 3 },
            columnStyles: {
                0: { cellWidth: 30 },
                1: { cellWidth: 'auto' },
                2: { cellWidth: 35, halign: 'right' }
            }
        });
        yPos = doc.lastAutoTable.finalY + 15;
    } else {
        yPos += 5;
        doc.setFont("helvetica", "italic");
        doc.text("No hay tareas registradas para este período.", margin, yPos);
        yPos += 15;
    }

    // Resumen Financiero
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("RESUMEN FINANCIERO", margin, yPos);
    yPos += 8;

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");

    // Fila 1: Total
    doc.text("Total Generado:", margin, yPos);
    doc.text(totalGen, margin + 80, yPos, { align: "right" });
    yPos += 8;

    // Fila 2: Abonado
    doc.text("Total Abonado / Pagado:", margin, yPos);
    doc.text(totalAbonado, margin + 80, yPos, { align: "right" });
    yPos += 8;

    // Línea divisoria
    doc.setLineWidth(0.5);
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPos - 4, margin + 80, yPos - 4);

    // Fila 3: Pendiente
    doc.setFont("helvetica", "bold");
    doc.setTextColor(220, 53, 69); // Rojo para deudas
    doc.text("Balance Pendiente:", margin, yPos);
    doc.text(totalPendiente, margin + 80, yPos, { align: "right" });

    // Pie de página
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(150, 150, 150);
    doc.text("Documento generado automáticamente por Sistema de Tareas.", margin, pageHeight - 15);

    // Guardar el PDF con un nombre bonito
    const safeName = clientName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    doc.save(`recibo_${safeName}_${new Date().getTime()}.pdf`);
};

const setupEventListeners = () => {
    // 1. Registro de Tareas
    document.getElementById('taskForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('taskName').value;
        const assignment = document.getElementById('taskAssignment').value;
        const date = document.getElementById('taskDate').value;
        const amount = parseFloat(document.getElementById('taskAmount').value) || 0;

        if (editingTaskId) {
            const taskIndex = state.tasks.findIndex(t => t.id === editingTaskId);
            if (taskIndex > -1) {
                state.tasks[taskIndex] = { id: editingTaskId, name, assignment, date, amount };
            }
            editingTaskId = null;
            const submitBtn = document.querySelector('#taskForm button[type="submit"]');
            submitBtn.innerHTML = '<i data-lucide="plus-circle"></i> REGISTRAR';
            submitBtn.style.backgroundColor = '';
            submitBtn.style.color = '';

            saveData();
            // Re-disparar búsqueda para actualizar la tabla
            document.getElementById('btnSearch').click();
        } else {
            state.tasks.push({ id: Date.now(), name, assignment, date, amount });
            saveData();
        }

        // Limpiar
        document.getElementById('taskName').value = '';
        document.getElementById('taskAssignment').value = '';
        document.getElementById('taskAmount').value = '';

        // Feedback visual
        const billedEl = document.getElementById('totalBilledAmount');
        billedEl.classList.remove('animate-fade-in');
        void billedEl.offsetWidth; // trigger reflow
        billedEl.classList.add('animate-fade-in');
    });

    // 1.5 Eventos de Edición/Eliminación en Historial de Búsqueda
    document.getElementById('searchHistoryBody').addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-task-btn');
        const deleteBtn = e.target.closest('.delete-task-btn');

        if (deleteBtn) {
            const taskId = parseInt(deleteBtn.dataset.id);
            if (confirm('¿Estás seguro de que deseas eliminar esta asignación?')) {
                state.tasks = state.tasks.filter(t => t.id !== taskId);
                saveData();
                document.getElementById('btnSearch').click(); // Actualizar tabla y totales
            }
        }

        if (editBtn) {
            const taskId = parseInt(editBtn.dataset.id);
            const taskIndex = state.tasks.findIndex(t => t.id === taskId);
            if (taskIndex > -1) {
                const task = state.tasks[taskIndex];

                // Poblar formulario
                document.getElementById('taskName').value = task.name;
                document.getElementById('taskAssignment').value = task.assignment;
                document.getElementById('taskDate').value = task.date;
                document.getElementById('taskAmount').value = task.amount;

                editingTaskId = task.id;

                // Cambiar apariencia del botón
                const submitBtn = document.querySelector('#taskForm button[type="submit"]');
                submitBtn.innerHTML = '<i data-lucide="save"></i> GUARDAR CAMBIOS';
                submitBtn.style.backgroundColor = 'var(--success)';
                submitBtn.style.color = '#fff';
                lucide.createIcons();

                // Hacer scroll suave hacia el formulario
                document.getElementById('taskForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    });

    // 2. Buscador por Persona
    document.getElementById('btnSearch').addEventListener('click', () => {
        const query = document.getElementById('searchPerson').value.toLowerCase();
        const historyBody = document.getElementById('searchHistoryBody');
        const historyContainer = document.getElementById('searchHistoryContainer');

        let total = 0;
        let htmlRows = '';
        let foundTasks = false;

        if (query.trim() === '') {
            historyContainer.style.display = 'none';
            document.getElementById('searchTotalAmount').textContent = formatCurrency(0);
            document.getElementById('searchPaidAmount').textContent = formatCurrency(0);
            document.getElementById('searchPersonInfo').style.display = 'none';
            return;
        }

        const normalizeString = (str) => {
            if (!str) return '';
            return str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
        };
        const queryNormalized = normalizeString(query);

        // Ordenar tareas por fecha más reciente
        const sortedTasks = [...state.tasks].sort((a, b) => new Date(b.date) - new Date(a.date));

        sortedTasks.forEach(t => {
            if (normalizeString(t.name).includes(queryNormalized)) {
                total += parseFloat(t.amount || 0);
                foundTasks = true;

                // Formatear fecha
                const dateStr = t.date ? new Date(t.date).toLocaleDateString('es-ES') : '';

                htmlRows += `
                    <tr>
                        <td>${dateStr}</td>
                        <td title="${t.assignment}">${t.assignment.length > 30 ? t.assignment.substring(0, 30) + '...' : t.assignment}</td>
                        <td class="text-success">${formatCurrency(parseFloat(t.amount || 0))}</td>
                        <td style="display: flex; gap: 0.25rem; justify-content: flex-end;">
                            <button class="btn btn-outline btn-sm edit-task-btn" data-id="${t.id}" style="padding: 0.4rem; border-color: var(--primary); color: var(--primary);" title="Editar Tarea"><i data-lucide="edit-2"></i></button>
                            <button class="btn btn-delete btn-sm delete-task-btn" data-id="${t.id}" title="Eliminar Tarea"><i data-lucide="trash-2"></i></button>
                        </td>
                    </tr>
                `;
            }
        });

        document.getElementById('searchTotalAmount').textContent = formatCurrency(total);

        // Calcular cuánto ha abonado/pagado esta persona (buscando en el array state.people)
        // Buscar todas las coincidencias de personas similitud
        const matches = state.people.filter(p => {
            const pName = normalizeString(p.name);
            return pName.includes(queryNormalized) || queryNormalized.includes(pName);
        });

        let totalPaid = 0;
        let bestPerson = null;

        if (matches.length > 0) {
            // Pick the one with the most similar (longest) name as display
            bestPerson = matches.reduce((prev, curr) => curr.name.length > prev.name.length ? curr : prev);
            
            matches.forEach(m => {
                if (!Array.isArray(m.payments)) {
                    const oldVal = parseFloat(m.lastPayment || 0);
                    m.payments = oldVal > 0 ? [{ amount: oldVal, date: new Date().toISOString() }] : [];
                }
                totalPaid += m.payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
            });
        }

        const personInfoContainer = document.getElementById('searchPersonInfo');
        if (bestPerson) {
            document.getElementById('searchPersonNameDisplay').textContent = bestPerson.name;
            document.getElementById('searchPersonMatDisplay').textContent = bestPerson.matricula || '(Sin Matrícula)';
            personInfoContainer.style.display = 'block';
        } else {
            personInfoContainer.style.display = 'none';
        }

        document.getElementById('searchAbonadoAmount').textContent = formatCurrency(totalPaid);
        document.getElementById('searchPaidAmount').textContent = formatCurrency(Math.max(0, total - totalPaid));

        const paymentSection = document.getElementById('paymentSection');
        if (foundTasks || bestPerson) {
            historyBody.innerHTML = htmlRows || '<tr><td colspan="4" class="text-center text-muted">No hay tareas registradas para esta persona.</td></tr>';
            historyContainer.style.display = 'block';
            paymentSection.style.display = 'block';
            lucide.createIcons();

            if (bestPerson) {
                paymentSection.dataset.personId = bestPerson.id;
            } else {
                delete paymentSection.dataset.personId;
            }
        } else {
            historyContainer.style.display = 'none';
            paymentSection.style.display = 'none';
        }
    });

    // 2.0 Botón Exportar PDF (General de la Búsqueda)
    document.getElementById('btnExportPDF').addEventListener('click', () => {
        // Obtener datos del UI de Búsqueda
        const query = document.getElementById('searchPerson').value;
        const nameDisplay = document.getElementById('searchPersonNameDisplay').textContent;
        const matDisplay = document.getElementById('searchPersonMatDisplay').textContent;
        const totalGen = document.getElementById('searchTotalAmount').textContent;
        const totalAbonado = document.getElementById('searchAbonadoAmount').textContent;
        const totalPendiente = document.getElementById('searchPaidAmount').textContent;

        const clientName = document.getElementById('searchPersonInfo').style.display !== 'none' ? nameDisplay : query.toUpperCase();

        generatePDFReceipt(clientName, matDisplay, totalGen, totalAbonado, totalPendiente, query);
    });

    // 2.0.1 Imprimir Factura a Deudores desde el Resumen
    document.addEventListener('click', (e) => {
        const printBtn = e.target.closest('.print-debtor-btn');
        if (printBtn) {
            const name = printBtn.dataset.name;
            const mat = printBtn.dataset.mat;
            const total = formatCurrency(parseFloat(printBtn.dataset.total));
            const paid = formatCurrency(parseFloat(printBtn.dataset.paid));
            const pending = formatCurrency(parseFloat(printBtn.dataset.pending));

            generatePDFReceipt(name, mat || '(Sin Matrícula)', total, paid, pending, name);
        }
    });

    // 2.1 Botón Registrar Pago / Abono
    document.getElementById('btnRegisterPayment').addEventListener('click', () => {
        const paymentSection = document.getElementById('paymentSection');
        const personId = paymentSection.dataset.personId;
        const amountInput = document.getElementById('paymentAmountInput');
        const amountToAdd = parseFloat(amountInput.value);

        if (!personId) {
            alert("No se encontró una persona exacta coincidente para registrar el abono. Por favor escribe su nombre más específico o asegúrate que esté en la lista de Personas.");
            return;
        }

        if (isNaN(amountToAdd) || amountToAdd <= 0) {
            alert("Por favor ingresa un monto válido mayor a 0.");
            return;
        }

        const person = state.people.find(p => p.id == personId);
        if (person) {
            if (!Array.isArray(person.payments)) {
                const oldVal = parseFloat(person.lastPayment || 0);
                person.payments = oldVal > 0 ? [{ amount: oldVal, date: new Date().toISOString() }] : [];
            }

            // Añadir el nuevo pago con la fecha actual
            person.payments.push({
                amount: amountToAdd,
                date: new Date().toISOString()
            });

            saveData();
            renderPeople(); // Actualizamos la tabla de abajo

            amountInput.value = ''; // Limpiamos el input
            document.getElementById('btnSearch').click(); // Simulamos un clic en buscar para recargar la vista superior
        }
    });

    // 3. Mes Selector
    document.getElementById('monthSelector').addEventListener('change', (e) => {
        state.currentMonth = e.target.value;
        saveData();
    });

    // 4. Metas
    document.getElementById('tasksGoal').addEventListener('input', (e) => {
        state.goal = e.target.value;
        saveData();
    });

    // Botones Añadir
    document.getElementById('addExpenseBtn').addEventListener('click', () => {
        state.expenses.push({
            id: Date.now(), type: "NUEVO GASTO", amount: 0, process: 0, status: "Pendiente"
        });
        saveData();
        renderExpenses();
    });

    document.getElementById('addPersonBtn').addEventListener('click', () => {
        state.people.push({
            id: Date.now(), matricula: "", name: "Nueva Persona", nextDate: "", taskCount: "", lastPayment: "", observation: ""
        });
        saveData();
        renderPeople();
    });

    // Delegación de eventos para inputs dinámicos en la tabla de gastos
    document.getElementById('expensesTable').addEventListener('input', (e) => {
        const id = parseInt(e.target.dataset.id);
        const expense = state.expenses.find(x => x.id === id);

        if (expense) {
            if (e.target.classList.contains('expense-type')) {
                expense.type = e.target.value;
            } else if (e.target.classList.contains('expense-amount')) {
                expense.amount = parseFloat(e.target.value) || 0;
            }
            // Retrasar el saveData para no perder foco al escribir, o calcular sin redibujar todo
            clearTimeout(window.expenseSaveTimeout);
            window.expenseSaveTimeout = setTimeout(() => {
                saveData(); // Esto actualizará el "Cubierto" y "Estado" automáticamente
            }, 600);
        }
    });

    // Delegación para borrar gastos
    document.getElementById('expensesTable').addEventListener('click', (e) => {
        const delBtn = e.target.closest('.btn-delete');
        if (delBtn) {
            const id = parseInt(delBtn.dataset.id);
            state.expenses = state.expenses.filter(x => x.id !== id);
            saveData();
            renderExpenses();
        }
    });
};


const setupPeopleFilters = () => {
    const menu = document.getElementById('filterMenu');
    const searchInput = document.getElementById('filterSearchInput');
    const list = document.getElementById('filterList');
    const clearBtn = document.getElementById('clearFiltersBtn');

    // Mapeo amigable de fechas para la vista 'YYYY-MM-DD' a DD/MM/AAAA
    const formatDateFriendly = (dateStr) => {
        if (!dateStr) return '(Vacías)';
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    };

    const renderFilterList = (col, query) => {
        list.innerHTML = '';
        const rawValues = [...new Set(state.people.map(p => p[col] || ''))].sort();

        let filteredValues = rawValues;
        if (query) {
            filteredValues = rawValues.filter(v => {
                const searchTarget = col === 'nextDate' ? formatDateFriendly(v) : v;
                return searchTarget.toLowerCase().includes(query.toLowerCase());
            });
        }

        filteredValues.forEach(val => {
            const labelEl = document.createElement('label');
            labelEl.className = 'filter-item';

            const isChecked = filterState.checkboxesStatus[col] === null || filterState.checkboxesStatus[col].includes(val);
            const displayVal = col === 'nextDate' ? formatDateFriendly(val) : (val === '' ? '(Vacías)' : val);

            labelEl.innerHTML = `
                <input type="checkbox" value="${val}" ${isChecked ? 'checked' : ''}>
                <span>${displayVal}</span>
            `;
            list.appendChild(labelEl);
        });
    };

    // Toggle menu
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const col = btn.dataset.col;
            filterState.activePopupCol = col;

            const rect = btn.getBoundingClientRect();
            menu.style.top = `${rect.bottom + window.scrollY + 5}px`;
            menu.style.left = `${Math.max(10, rect.left + window.scrollX - 200)}px`;
            menu.classList.remove('hidden');

            renderFilterList(col, '');
            searchInput.value = '';
        });
    });

    searchInput.addEventListener('input', (e) => {
        renderFilterList(filterState.activePopupCol, e.target.value);
    });

    document.querySelectorAll('.btn-sort').forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterState.sortCol = filterState.activePopupCol;
            filterState.sortDir = btn.dataset.dir;
            menu.classList.add('hidden');
            renderPeople();
            updateFilterUI();
        });
    });

    document.getElementById('btnApplyFilter').addEventListener('click', () => {
        const col = filterState.activePopupCol;
        const checkboxes = list.querySelectorAll('input[type="checkbox"]');
        const checkedValues = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);

        const rawValues = [...new Set(state.people.map(p => p[col] || ''))];
        if (checkedValues.length === rawValues.length && !searchInput.value) {
            filterState.checkboxesStatus[col] = null;
        } else {
            filterState.checkboxesStatus[col] = checkedValues;
        }

        menu.classList.add('hidden');
        renderPeople();
        updateFilterUI();
    });

    document.getElementById('btnCancelFilter').addEventListener('click', () => {
        menu.classList.add('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && !e.target.closest('.filter-btn')) {
            menu.classList.add('hidden');
        }
    });

    clearBtn.addEventListener('click', () => {
        filterState = { sortCol: null, sortDir: null, activePopupCol: null, checkboxesStatus: { matricula: null, name: null, nextDate: null } };
        renderPeople();
        updateFilterUI();
    });
};

const updateFilterUI = () => {
    const clearBtn = document.getElementById('clearFiltersBtn');
    const hasFilters = filterState.sortCol !== null ||
        Object.values(filterState.checkboxesStatus).some(val => val !== null);

    clearBtn.style.display = hasFilters ? 'inline-flex' : 'none';

    document.querySelectorAll('.filter-btn').forEach(btn => {
        const col = btn.dataset.col;
        if (col === filterState.sortCol || filterState.checkboxesStatus[col] !== null) {
            btn.classList.add('active');
            btn.style.color = 'var(--primary)';
        } else {
            btn.classList.remove('active');
            btn.style.color = 'var(--text-muted)';
        }
    });
};

// Modificaciones en tiempo real en las tablas
// La función attachExpenseEvents fue eliminada aquí porque la delegación de eventos ahora se maneja arriba en setupEventListeners.

const attachPeopleEvents = () => {
    const updatePersonField = (e, field) => {
        const id = parseFloat(e.target.dataset.id);
        const val = e.target.value;
        const p = state.people.find(x => x.id === id);
        if (p) {
            if (field === 'name' && p.name !== val) {
                const oldName = p.name;
                const normalize = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
                const oldNormalized = normalize(oldName);
                
                // Actualizar todas las tareas que coincidan con el nombre antiguo
                state.tasks.forEach(task => {
                    if (normalize(task.name) === oldNormalized) {
                        task.name = val;
                    }
                });
            }
            p[field] = val;
            saveData();
            if (field === 'nextDate' || field === 'name') renderAll(); // Redibujar todo si cambia el nombre para actualizar deudores
        }
    };

    document.querySelectorAll('.person-mat').forEach(inp => inp.addEventListener('change', (e) => updatePersonField(e, 'matricula')));
    document.querySelectorAll('.person-name').forEach(inp => inp.addEventListener('change', (e) => updatePersonField(e, 'name')));
    document.querySelectorAll('.person-date').forEach(inp => inp.addEventListener('change', (e) => updatePersonField(e, 'nextDate')));
    document.querySelectorAll('.person-obs').forEach(inp => inp.addEventListener('change', (e) => updatePersonField(e, 'observation')));

    // Delete
    document.querySelectorAll('#peopleTable .btn-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const btnEl = e.target.closest('button');
            const id = parseFloat(btnEl.dataset.id);
            state.people = state.people.filter(x => x.id !== id);
            saveData();
            renderPeople();
        });
    });
};

init();
