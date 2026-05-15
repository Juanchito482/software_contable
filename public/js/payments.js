const Payments = {
  allPayments: [],

  render(container) {
    const canWrite = Auth.canWrite();
    container.innerHTML = `
      <div class="page-header">
        <h2>Pagos / Ingresos</h2>
        ${canWrite ? '<button class="btn btn-primary" onclick="Payments.showForm()"><i class="bi bi-plus-lg"></i> Nuevo Pago</button>' : ''}
      </div>
      <div class="filter-bar">
        <div class="search-box">
          <i class="bi bi-search search-icon"></i>
          <input type="text" class="form-control" placeholder="Buscar estudiante..." id="paymentSearch" oninput="Payments.search(this.value)">
        </div>
        <input type="date" class="form-control" id="paymentStart" onchange="Payments.applyFilters()">
        <input type="date" class="form-control" id="paymentEnd" onchange="Payments.applyFilters()">
        <select class="form-select" id="paymentConcept" onchange="Payments.applyFilters()">
          <option value="">Todos los conceptos</option>
        </select>
        <button class="btn btn-outline-success" onclick="Payments.exportPDF()"><i class="bi bi-filetype-pdf"></i></button>
        <button class="btn btn-outline-success" onclick="Payments.exportExcel()"><i class="bi bi-file-earmark-excel"></i></button>
      </div>
      <div class="card">
        <div class="card-body">
          <div class="table-container">
            <table class="table table-hover">
              <thead><tr><th>Fecha</th><th>Estudiante</th><th>Concepto</th><th>Monto</th><th>Método</th><th>Recibo</th>${canWrite ? '<th style="width:80px">Acción</th>' : ''}</tr></thead>
              <tbody id="paymentsBody"></tbody>
            </table>
          </div>
          <div id="paymentsTotal" class="text-end mt-3"></div>
        </div>
      </div>
      <div id="paymentsEmpty" class="empty-state" style="display:none">
        <i class="bi bi-cash-coin"></i>
        <p>No hay pagos registrados</p>
      </div>
    `;
    API.getConfig('concepts').then(concepts => {
      const sel = document.getElementById('paymentConcept');
      concepts.forEach(c => { sel.innerHTML += `<option value="${c}">${c}</option>`; });
    });
    this.load();
  },

  load() {
    API.getPayments().then(payments => {
      this.allPayments = payments;
      this.renderTable(payments);
    }).catch(e => App.toast(e.message, 'error'));
  },

  renderTable(payments) {
    const tbody = document.getElementById('paymentsBody');
    const empty = document.getElementById('paymentsEmpty');
    const totalDiv = document.getElementById('paymentsTotal');
    if (!tbody) return;
    if (payments.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
      if (totalDiv) totalDiv.innerHTML = '';
      return;
    }
    if (empty) empty.style.display = 'none';
    const canWrite = Auth.canWrite();
    const total = payments.reduce((s, p) => s + p.amount, 0);
    tbody.innerHTML = payments.map(p => `
      <tr>
        <td>${App.formatDate(p.payment_date)}</td>
        <td><strong>${p.student_name}</strong></td>
        <td><span class="badge-concept" style="background:#e8f5e9;color:#2e7d32">${p.concept}</span></td>
        <td><strong>${App.formatCurrency(p.amount)}</strong></td>
        <td>${p.payment_method}</td>
        <td>${p.receipt_number || '-'}</td>
        ${canWrite ? `<td>${Auth.isAdmin() ? `<button class="btn btn-sm btn-outline-danger btn-action" onclick="Payments.confirmDelete(${p.id})" title="Eliminar"><i class="bi bi-trash"></i></button>` : ''}</td>` : ''}
      </tr>
    `).join('');
    if (totalDiv) totalDiv.innerHTML = '<strong>Total: ' + App.formatCurrency(total) + '</strong>';
  },

  applyFilters() {
    let filtered = this.allPayments;
    const search = (document.getElementById('paymentSearch').value || '').toLowerCase();
    const start = document.getElementById('paymentStart').value;
    const end = document.getElementById('paymentEnd').value;
    const concept = document.getElementById('paymentConcept').value;
    if (search) filtered = filtered.filter(p => (p.student_name || '').toLowerCase().includes(search));
    if (start) filtered = filtered.filter(p => p.payment_date >= start);
    if (end) filtered = filtered.filter(p => p.payment_date <= end);
    if (concept) filtered = filtered.filter(p => p.concept === concept);
    this.renderTable(filtered);
  },

  search(q) {
    this.applyFilters();
  },

  showForm() {
    API.getConfig('concepts').then(concepts => {
      API.getConfig('payment-methods').then(methods => {
        API.getStudents('?status=activo').then(students => {
          const conceptOpts = concepts.map(c => `<option value="${c}">${c}</option>`).join('');
          const methodOpts = methods.map(m => `<option value="${m}">${m}</option>`).join('');
          const studentOpts = students.map(s => `<option value="${s.id}">${s.full_name} - ${s.grade}</option>`).join('');
          App.openModal('Nuevo Pago', `
            <div class="mb-3"><label class="form-label">Estudiante *</label><select class="form-select" id="pStudent">${studentOpts}</select></div>
            <div class="mb-3"><label class="form-label">Concepto *</label><select class="form-select" id="pConcept">${conceptOpts}</select></div>
            <div class="mb-3"><label class="form-label">Monto *</label><input type="number" class="form-control" id="pAmount" min="1" step="1000"></div>
            <div class="row"><div class="col-md-6 mb-3"><label class="form-label">Fecha *</label><input type="date" class="form-control" id="pDate" value="${new Date().toISOString().split('T')[0]}"></div>
            <div class="col-md-6 mb-3"><label class="form-label">Método de Pago *</label><select class="form-select" id="pMethod">${methodOpts}</select></div></div>
            <div class="mb-3"><label class="form-label">N° Recibo</label><input type="text" class="form-control" id="pReceipt"></div>
            <div class="mb-3"><label class="form-label">Notas</label><textarea class="form-control" id="pNotes" rows="2"></textarea></div>
          `, () => this.save());
        });
      });
    });
  },

  save() {
    const data = {
      student_id: parseInt(document.getElementById('pStudent').value),
      concept: document.getElementById('pConcept').value,
      amount: parseFloat(document.getElementById('pAmount').value),
      payment_date: document.getElementById('pDate').value,
      payment_method: document.getElementById('pMethod').value,
      receipt_number: document.getElementById('pReceipt').value.trim() || null,
      notes: document.getElementById('pNotes').value.trim() || null,
    };
    if (!data.student_id || !data.concept || !data.amount || !data.payment_date || !data.payment_method) {
      App.toast('Complete todos los campos requeridos', 'error'); return;
    }
    if (data.amount <= 0) { App.toast('El monto debe ser mayor a 0', 'error'); return; }
    API.createPayment(data).then(() => {
      App.toast('Pago registrado exitosamente');
      App.closeModal();
      this.load();
    }).catch(e => App.toast(e.message, 'error'));
  },

  confirmDelete(id) {
    App.confirm('¿Eliminar este pago?', () => {
      API.deletePayment(id).then(() => {
        App.toast('Pago eliminado');
        this.load();
      }).catch(e => App.toast(e.message, 'error'));
    });
  },

  exportPDF() {
    const start = document.getElementById('paymentStart').value;
    const end = document.getElementById('paymentEnd').value;
    let params = '?type=payments';
    if (start && end) params += '&start=' + start + '&end=' + end;
    API.exportPDF(params);
  },

  exportExcel() {
    const start = document.getElementById('paymentStart').value;
    const end = document.getElementById('paymentEnd').value;
    let params = '?type=payments';
    if (start && end) params += '&start=' + start + '&end=' + end;
    API.exportExcel(params);
  }
};
