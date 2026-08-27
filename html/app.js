(function () {
    'use strict';

    var RESOURCE_NAME = 'modora-admin';

    function getParentResourceName() {
        if (typeof GetParentResourceName === 'function') {
            return GetParentResourceName();
        }
        return RESOURCE_NAME;
    }

    // ── Utility ──

    function escapeText(str) {
        if (str == null || typeof str !== 'string') return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function sendNuiCallback(name, data) {
        data = data || {};
        return fetch('https://' + getParentResourceName() + '/' + name, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        });
    }

    function el(tag, attrs, children) {
        var node = document.createElement(tag);
        if (attrs) {
            Object.keys(attrs).forEach(function (k) {
                if (k === 'className') node.className = attrs[k];
                else if (k === 'textContent') node.textContent = attrs[k];
                else if (k === 'innerHTML') node.innerHTML = attrs[k];
                else if (k.indexOf('on') === 0) node.addEventListener(k.substring(2).toLowerCase(), attrs[k]);
                else node.setAttribute(k, attrs[k]);
            });
        }
        if (children) {
            if (!Array.isArray(children)) children = [children];
            children.forEach(function (c) {
                if (typeof c === 'string') node.appendChild(document.createTextNode(c));
                else if (c) node.appendChild(c);
            });
        }
        return node;
    }

    function formatTimeAgo(ts) {
        if (!ts) return '';
        var now = Date.now();
        var then = typeof ts === 'number' ? ts : new Date(ts).getTime();
        var diff = Math.max(0, Math.floor((now - then) / 1000));
        if (diff < 60) return 'just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        return Math.floor(diff / 86400) + 'd ago';
    }

    function formatUptime(seconds) {
        if (seconds == null || seconds < 0) return '--';
        var h = Math.floor(seconds / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        var s = Math.floor(seconds % 60);
        if (h > 0) return h + 'h ' + m + 'm';
        if (m > 0) return m + 'm ' + s + 's';
        return s + 's';
    }

    // ── State ──

    var DEFAULT_CATEGORIES = [
        { id: 'scam', label: 'Scam' },
        { id: 'harassment', label: 'Harassment' },
        { id: 'exploit', label: 'Exploit' },
        { id: 'cheating', label: 'Cheating' },
        { id: 'bugs', label: 'Bugs' },
        { id: 'other', label: 'Other' }
    ];

    var state = {
        activeView: null, // 'report' | 'status' | 'stats'
        init: null,
        playerData: null,
        serverConfig: null,
        // Report wizard
        reportStep: 1,
        form: {
            category: '',
            targetMode: 'none', // 'none' | 'player' | 'manual'
            targets: [],
            manualTarget: '',
            subject: '',
            description: '',
            severity: 'low',
            evidenceUrls: [],
            screenshotUrl: null,
            customFields: {}
        },
        cooldownRemaining: 0,
        lastSuccess: null,
        // Status view
        reports: [],
        expandedReportId: null
    };

    var appRoot = null;

    // ── Rendering core ──

    function clearApp() {
        if (!appRoot) appRoot = document.getElementById('app');
        appRoot.innerHTML = '';
    }

    function closeAll() {
        state.activeView = null;
        clearApp();
    }

    // ── Shared UI builders ──

    function buildBackdrop(onClose) {
        return el('div', { className: 'backdrop', onClick: onClose });
    }

    function buildCloseBtn(onClose) {
        return el('button', { className: 'btn-close', type: 'button', 'aria-label': 'Close', onClick: onClose, innerHTML: '&#215;' });
    }

    function buildModalHeader(title, subtitle, onClose) {
        var header = el('div', { className: 'modal-header' }, [
            buildCloseBtn(onClose),
            el('div', { className: 'modal-header-title' }, [
                el('h2', { textContent: title })
            ])
        ]);
        if (subtitle) header.appendChild(el('p', { className: 'modal-subtitle', textContent: subtitle }));
        return header;
    }

    function buildDropdown(options, selectedValue, placeholder, onChange) {
        var wrapper = el('div', { className: 'dropdown' });
        var selectedOpt = options.filter(function (o) { return o.value === selectedValue; })[0];
        var labelText = selectedOpt ? selectedOpt.label : placeholder;

        var trigger = el('div', { className: 'dropdown-trigger' + (false ? ' open' : ''), tabindex: '0' });
        var triggerLabel = el('span', { textContent: labelText });
        trigger.appendChild(triggerLabel);
        wrapper.appendChild(trigger);

        var chevron = el('span', { className: 'dropdown-chevron', innerHTML: '&#9660;' });
        wrapper.appendChild(chevron);

        var menu = el('div', { className: 'dropdown-menu' });
        options.forEach(function (opt) {
            var optEl = el('div', {
                className: 'dropdown-option' + (opt.value === selectedValue ? ' selected' : ''),
                textContent: opt.label,
                'data-value': opt.value,
                onClick: function () {
                    triggerLabel.textContent = this.textContent;
                    menu.querySelectorAll('.dropdown-option').forEach(function (o) { o.classList.remove('selected'); });
                    this.classList.add('selected');
                    trigger.classList.remove('open');
                    menu.classList.remove('open');
                    onChange(this.getAttribute('data-value'));
                }
            });
            menu.appendChild(optEl);
        });
        wrapper.appendChild(menu);

        function closeMenu() {
            trigger.classList.remove('open');
            menu.classList.remove('open');
            document.removeEventListener('click', closeMenu);
        }

        trigger.addEventListener('click', function (e) {
            e.stopPropagation();
            var isOpen = trigger.classList.toggle('open');
            menu.classList.toggle('open', isOpen);
            if (isOpen) setTimeout(function () { document.addEventListener('click', closeMenu); }, 0);
            else document.removeEventListener('click', closeMenu);
        });

        return wrapper;
    }

    // ── Data helpers ──

    function requestPlayerData() {
        return sendNuiCallback('requestPlayerData', {}).then(function (data) {
            if (data && data.success && data.playerData) {
                state.playerData = data.playerData;
                return state.playerData;
            }
            throw new Error('No player data');
        });
    }

    function requestServerConfig() {
        return sendNuiCallback('requestServerConfig', {}).then(function (data) {
            if (data && data.success && data.config) {
                state.serverConfig = data.config;
                return state.serverConfig;
            }
            return null;
        });
    }

    function getCategories() {
        var rfc = state.serverConfig && state.serverConfig.reportFormConfig;
        if (rfc && rfc.categories && rfc.categories.length) {
            return rfc.categories.map(function (c) {
                return { id: c.id, label: c.label || c.id, fields: c.fields || [] };
            });
        }
        var cats = (state.serverConfig && state.serverConfig.categories) || DEFAULT_CATEGORIES;
        return cats.map(function (c) {
            var id = typeof c === 'object' ? (c.id || c.value) : c;
            var label = typeof c === 'object' ? (c.label || c.name || id) : id;
            return { id: id, label: label, fields: [] };
        });
    }

    function getSelectedCategoryData() {
        var catId = state.form.category;
        if (!catId) return null;
        var cats = getCategories();
        for (var i = 0; i < cats.length; i++) {
            if (cats[i].id === catId) return cats[i];
        }
        return null;
    }

    function sortFields(fields) {
        if (!fields || !fields.length) return [];
        return fields.slice().sort(function (a, b) {
            return (a.order != null ? a.order : 999) - (b.order != null ? b.order : 999);
        });
    }

    // ════════════════════════════════════════
    // ██ REPORT FORM — Multi-Step Wizard
    // ════════════════════════════════════════

    var STEPS = [
        { num: 1, label: 'Category' },
        { num: 2, label: 'Details' },
        { num: 3, label: 'Evidence' },
        { num: 4, label: 'Review' }
    ];

    function openReportForm(initData) {
        state.activeView = 'report';
        state.reportStep = 1;
        state.form = {
            category: '',
            targetMode: 'none',
            targets: [],
            manualTarget: '',
            subject: '',
            description: '',
            severity: 'low',
            evidenceUrls: [],
            screenshotUrl: null,
            customFields: {}
        };
        state.lastSuccess = null;

        if (initData) {
            state.init = {
                serverName: initData.serverName || (state.init && state.init.serverName),
                cooldownRemaining: initData.cooldownRemaining != null ? initData.cooldownRemaining : (state.init && state.init.cooldownRemaining),
                playerName: initData.playerName || (state.init && state.init.playerName),
                theme: initData.theme,
                version: initData.version
            };
        }

        renderReportLoading();

        Promise.all([requestPlayerData(), requestServerConfig()]).then(function () {
            renderReportWizard();
        }).catch(function () {
            renderReportWizard();
        });
    }

    function closeReportForm() {
        closeAll();
        sendNuiCallback('closeReport', {}).catch(function () { });
    }

    function renderReportLoading() {
        clearApp();
        appRoot.appendChild(buildBackdrop(closeReportForm));
        var modal = el('div', { className: 'modal modal-report' }, [
            buildModalHeader('Report', 'Loading...', closeReportForm),
            el('div', { className: 'modal-body' }, [
                el('div', { className: 'loading-state' }, [
                    el('div', { className: 'spinner' }),
                    el('span', { textContent: 'Loading report form...' })
                ])
            ])
        ]);
        appRoot.appendChild(modal);
    }

    function renderReportWizard() {
        clearApp();
        appRoot.appendChild(buildBackdrop(closeReportForm));

        var subtitle = 'Submit a report to staff';
        if (state.init && state.init.serverName) subtitle += ' - ' + state.init.serverName;

        var modal = el('div', { className: 'modal modal-report' });
        modal.appendChild(buildModalHeader('Report', subtitle, closeReportForm));
        modal.appendChild(buildStepIndicator());

        var body = el('div', { className: 'modal-body' });
        body.appendChild(renderCurrentStep());
        modal.appendChild(body);
        modal.appendChild(buildWizardFooter());

        appRoot.appendChild(modal);
    }

    function renderReportSuccess(ticketNumber, ticketUrl) {
        clearApp();
        appRoot.appendChild(buildBackdrop(closeReportForm));
        var msg = ticketNumber != null
            ? 'Your report was submitted. Ticket #' + escapeText(String(ticketNumber))
            : 'Your report was submitted successfully.';

        var modal = el('div', { className: 'modal modal-report' }, [
            buildModalHeader('Report', null, closeReportForm),
            el('div', { className: 'modal-body' }, [
                el('div', { className: 'success-state' }, [
                    el('div', { className: 'success-icon', textContent: '\u2713' }),
                    el('h3', { textContent: 'Report sent' }),
                    el('p', { textContent: msg }),
                    el('button', { className: 'btn btn-primary', type: 'button', textContent: 'Close', onClick: closeReportForm })
                ])
            ])
        ]);
        appRoot.appendChild(modal);
    }

    function renderReportError(errorMsg) {
        // Re-render wizard with error toast
        renderReportWizard();
        var body = appRoot.querySelector('.modal-body');
        if (body) {
            var toast = el('div', { className: 'toast toast-error', textContent: errorMsg || 'Report could not be sent.' });
            body.insertBefore(toast, body.firstChild);
        }
    }

    function buildStepIndicator() {
        var container = el('div', { className: 'step-indicator' });
        STEPS.forEach(function (step) {
            var cls = 'step-item';
            if (step.num < state.reportStep) cls += ' completed';
            else if (step.num === state.reportStep) cls += ' active';

            var dotContent = step.num < state.reportStep ? '\u2713' : String(step.num);
            var item = el('div', { className: cls }, [
                el('div', { className: 'step-dot', textContent: dotContent }),
                el('span', { className: 'step-label', textContent: step.label })
            ]);
            container.appendChild(item);
        });
        return container;
    }

    function buildWizardFooter() {
        var footer = el('div', { className: 'modal-footer' });
        var hint = el('div', { className: 'modal-footer-hint', textContent: 'Reports are reviewed by staff. Do not abuse; rate limits apply.' });
        var actions = el('div', { className: 'modal-footer-actions' });

        if (state.reportStep > 1) {
            actions.appendChild(el('button', {
                className: 'btn btn-secondary', type: 'button', textContent: 'Back',
                onClick: function () { state.reportStep--; renderReportWizard(); }
            }));
        } else {
            actions.appendChild(el('button', {
                className: 'btn btn-secondary', type: 'button', textContent: 'Cancel',
                onClick: closeReportForm
            }));
        }

        if (state.reportStep < 4) {
            actions.appendChild(el('button', {
                className: 'btn btn-primary', type: 'button', textContent: 'Next',
                onClick: function () {
                    if (validateStep(state.reportStep)) {
                        state.reportStep++;
                        renderReportWizard();
                    }
                }
            }));
        } else {
            actions.appendChild(el('button', {
                className: 'btn btn-primary', type: 'button', textContent: 'Submit report',
                onClick: submitReport
            }));
        }

        footer.appendChild(hint);
        footer.appendChild(actions);
        return footer;
    }

    function renderCurrentStep() {
        var content = el('div', { className: 'step-content' });
        switch (state.reportStep) {
            case 1: renderStep1(content); break;
            case 2: renderStep2(content); break;
            case 3: renderStep3(content); break;
            case 4: renderStep4(content); break;
        }
        return content;
    }

    // ── Step 1: Category & Target ──

    function renderStep1(container) {
        var categories = getCategories();

        // Intro text from server config
        var rfc = state.serverConfig && state.serverConfig.reportFormConfig;
        if (rfc && rfc.introText) {
            container.appendChild(el('p', { className: 'form-hint', textContent: String(rfc.introText).trim(), style: 'margin-bottom: 14px;' }));
        }

        // Category selection
        var catGroup = el('div', { className: 'form-group' });
        catGroup.appendChild(el('label', { className: 'form-label', innerHTML: 'Category <span class="required">*</span>' }));

        if (categories.length <= 8) {
            // Button grid for small number of categories
            var grid = el('div', { className: 'category-grid' });
            categories.forEach(function (cat) {
                grid.appendChild(el('button', {
                    className: 'category-btn' + (state.form.category === cat.id ? ' selected' : ''),
                    type: 'button',
                    textContent: cat.label,
                    'data-value': cat.id,
                    onClick: function () {
                        state.form.category = cat.id;
                        state.form.customFields = {};
                        renderReportWizard();
                    }
                }));
            });
            catGroup.appendChild(grid);
        } else {
            // Dropdown for many categories
            var opts = categories.map(function (c) { return { value: c.id, label: c.label }; });
            catGroup.appendChild(buildDropdown(opts, state.form.category, 'Select category...', function (val) {
                state.form.category = val;
                state.form.customFields = {};
                renderReportWizard();
            }));
        }

        catGroup.appendChild(el('div', { className: 'form-error hidden', id: 'err-category' }));
        container.appendChild(catGroup);

        // Target player selection
        var players = (state.playerData && state.playerData.nearbyPlayers) || [];
        var targetGroup = el('div', { className: 'form-group' });
        targetGroup.appendChild(el('label', { className: 'form-label', textContent: 'Target player' }));

        // No specific player button
        var noneBtn = el('button', {
            className: 'player-none-btn' + (state.form.targetMode === 'none' ? ' selected' : ''),
            type: 'button',
            textContent: 'No specific player',
            onClick: function () {
                state.form.targetMode = 'none';
                state.form.targets = [];
                state.form.manualTarget = '';
                renderReportWizard();
            }
        });
        targetGroup.appendChild(noneBtn);

        if (players.length > 0) {
            targetGroup.appendChild(el('label', { className: 'form-hint', textContent: 'Nearby players:', style: 'margin-bottom: 6px; display: block;' }));
            var list = el('div', { className: 'player-list' });
            players.forEach(function (p) {
                var isSelected = state.form.targets.some(function (t) { return t.fivemId === p.fivemId; });
                var option = el('label', { className: 'player-option' });
                var cb = el('input', {
                    type: 'checkbox',
                    value: String(p.fivemId),
                    'data-name': p.name || ''
                });
                if (isSelected) cb.checked = true;
                cb.addEventListener('change', function () {
                    state.form.targetMode = 'player';
                    if (this.checked) {
                        state.form.targets.push({ fivemId: parseInt(this.value, 10), name: this.getAttribute('data-name') || '' });
                    } else {
                        var val = parseInt(this.value, 10);
                        state.form.targets = state.form.targets.filter(function (t) { return t.fivemId !== val; });
                    }
                    if (state.form.targets.length === 0) state.form.targetMode = 'none';
                });
                var label = (p.name || 'Player') + ' (ID: ' + p.fivemId + (p.distance != null ? ', ' + p.distance + 'm' : '') + ')';
                option.appendChild(cb);
                option.appendChild(el('span', { textContent: label }));
                list.appendChild(option);
            });
            targetGroup.appendChild(list);
        }

        // Manual target input
        var manualBtn = el('button', {
            className: 'player-none-btn' + (state.form.targetMode === 'manual' ? ' selected' : ''),
            type: 'button',
            textContent: 'Enter name manually',
            style: 'margin-top: 8px;',
            onClick: function () {
                state.form.targetMode = 'manual';
                state.form.targets = [];
                renderReportWizard();
            }
        });
        targetGroup.appendChild(manualBtn);

        if (state.form.targetMode === 'manual') {
            var manualInput = el('input', {
                className: 'form-input manual-target-input',
                type: 'text',
                placeholder: 'Player name or ID...',
                value: state.form.manualTarget || '',
                style: 'margin-top: 8px;'
            });
            manualInput.addEventListener('input', function () {
                state.form.manualTarget = this.value;
            });
            targetGroup.appendChild(manualInput);
        }

        container.appendChild(targetGroup);
    }

    // ── Step 2: Details ──

    function renderStep2(container) {
        var rfc = (state.serverConfig && state.serverConfig.reportFormConfig) || {};
        var titleLabel = rfc.titleLabel || 'Subject';
        var titlePlaceholder = rfc.titlePlaceholder || 'Short title for your report';
        var descriptionLabel = rfc.descriptionLabel || 'Description';
        var descriptionPlaceholder = rfc.descriptionPlaceholder || 'Describe what happened in detail (min 20 characters)';

        // Subject
        var subGroup = el('div', { className: 'form-group' });
        subGroup.appendChild(el('label', { className: 'form-label', innerHTML: escapeText(titleLabel) + ' <span class="required">*</span>' }));
        var subInput = el('input', {
            className: 'form-input', type: 'text', id: 'inp-subject',
            placeholder: titlePlaceholder, maxlength: '80',
            value: state.form.subject || ''
        });
        subInput.addEventListener('input', function () {
            state.form.subject = this.value;
            var cc = document.getElementById('cc-subject');
            if (cc) cc.textContent = this.value.length + '/80';
        });
        subGroup.appendChild(subInput);
        subGroup.appendChild(el('div', { className: 'char-count', id: 'cc-subject', textContent: (state.form.subject || '').length + '/80' }));
        subGroup.appendChild(el('div', { className: 'form-error hidden', id: 'err-subject' }));
        container.appendChild(subGroup);

        // Description
        var descGroup = el('div', { className: 'form-group' });
        descGroup.appendChild(el('label', { className: 'form-label', innerHTML: escapeText(descriptionLabel) + ' <span class="required">*</span>' }));
        var descTa = el('textarea', {
            className: 'form-textarea', id: 'inp-description',
            placeholder: descriptionPlaceholder,
        });
        descTa.value = state.form.description || '';
        descTa.addEventListener('input', function () {
            state.form.description = this.value;
            var cc = document.getElementById('cc-description');
            if (cc) cc.textContent = this.value.length + '/2000';
        });
        descGroup.appendChild(descTa);
        descGroup.appendChild(el('div', { className: 'char-count', id: 'cc-description', textContent: (state.form.description || '').length + '/2000' }));
        descGroup.appendChild(el('div', { className: 'form-error hidden', id: 'err-description' }));
        container.appendChild(descGroup);

        // Severity
        var sevGroup = el('div', { className: 'form-group' });
        sevGroup.appendChild(el('label', { className: 'form-label', textContent: 'Severity' }));
        var sevRow = el('div', { className: 'severity-group' });
        ['low', 'medium', 'high', 'critical'].forEach(function (sev) {
            sevRow.appendChild(el('button', {
                className: 'severity-btn' + (state.form.severity === sev ? ' selected' : ''),
                type: 'button',
                textContent: sev.charAt(0).toUpperCase() + sev.slice(1),
                'data-severity': sev,
                onClick: function () {
                    state.form.severity = sev;
                    sevRow.querySelectorAll('.severity-btn').forEach(function (b) { b.classList.remove('selected'); });
                    this.classList.add('selected');
                }
            }));
        });
        sevGroup.appendChild(sevRow);
        container.appendChild(sevGroup);

        // Dynamic custom fields from category config
        var selectedCat = getSelectedCategoryData();
        var fields = selectedCat ? sortFields(selectedCat.fields) : [];
        if (fields.length) {
            var dynWrap = el('div', { className: 'dynamic-fields' });
            fields.forEach(function (field) {
                var fg = el('div', { className: 'form-group' });
                var labelHtml = escapeText(field.label || field.id);
                if (field.required) labelHtml += ' <span class="required">*</span>';
                fg.appendChild(el('label', { className: 'form-label', innerHTML: labelHtml }));

                var type = (field.type || 'text').toLowerCase();
                var value = state.form.customFields[field.id];

                if (type === 'text') {
                    var inp = el('input', {
                        className: 'form-input', type: 'text',
                        placeholder: field.placeholder || field.label || '',
                        value: value != null ? value : '',
                        'data-field-id': field.id
                    });
                    inp.addEventListener('input', function () { state.form.customFields[field.id] = this.value; });
                    fg.appendChild(inp);
                } else if (type === 'textarea') {
                    var ta = el('textarea', {
                        className: 'form-textarea',
                        placeholder: field.placeholder || field.label || '',
                        'data-field-id': field.id
                    });
                    ta.value = value != null ? value : '';
                    ta.addEventListener('input', function () { state.form.customFields[field.id] = this.value; });
                    fg.appendChild(ta);
                } else if (type === 'select') {
                    var opts = (field.options || []).map(function (o) { return { value: o, label: o }; });
                    fg.appendChild(buildDropdown(opts, value || '', 'Select...', function (val) {
                        state.form.customFields[field.id] = val;
                    }));
                } else if (type === 'number') {
                    var num = el('input', {
                        className: 'form-input', type: 'number',
                        placeholder: field.placeholder || field.label || '',
                        value: value != null ? value : '',
                        'data-field-id': field.id
                    });
                    num.addEventListener('input', function () { state.form.customFields[field.id] = this.value; });
                    fg.appendChild(num);
                }

                fg.appendChild(el('div', { className: 'form-error hidden', 'data-field-error': field.id }));
                dynWrap.appendChild(fg);
            });
            container.appendChild(dynWrap);
        }
    }

    // ── Step 3: Evidence ──

    function renderStep3(container) {
        var rfc = (state.serverConfig && state.serverConfig.reportFormConfig) || {};
        var screenshotLabel = rfc.screenshotLabel || 'Screenshot';
        var screenshotButtonLabel = rfc.screenshotButtonLabel || 'Take screenshot';

        // Screenshot
        var scGroup = el('div', { className: 'form-group' });
        scGroup.appendChild(el('label', { className: 'form-label', textContent: screenshotLabel }));

        if (state.form.screenshotUrl) {
            scGroup.appendChild(el('div', { className: 'screenshot-status', textContent: 'Screenshot captured' }));
        }

        var scBtn = el('button', {
            className: 'btn btn-secondary', type: 'button',
            textContent: state.form.screenshotUrl ? 'Retake screenshot' : screenshotButtonLabel,
            onClick: function () {
                var btn = this;
                btn.disabled = true;
                btn.textContent = 'Taking screenshot...';
                sendNuiCallback('requestScreenshotUpload', {}).then(function (data) {
                    btn.disabled = false;
                    btn.textContent = screenshotButtonLabel;
                    if (data && data.success && data.url) {
                        state.form.screenshotUrl = data.url;
                        if (state.form.evidenceUrls.indexOf(data.url) === -1) state.form.evidenceUrls.push(data.url);
                        renderReportWizard();
                    } else if (data && data.error) {
                        showReportToast(data.error);
                    }
                }).catch(function () {
                    btn.disabled = false;
                    btn.textContent = screenshotButtonLabel;
                });
            }
        });
        scGroup.appendChild(scBtn);
        container.appendChild(scGroup);

        // Evidence URLs
        var evGroup = el('div', { className: 'form-group' });
        evGroup.appendChild(el('label', { className: 'form-label', textContent: rfc.evidenceLabel || 'Evidence URLs' }));

        state.form.evidenceUrls.forEach(function (url, i) {
            var item = el('div', { className: 'evidence-item' });
            var inp = el('input', {
                className: 'form-input', type: 'url', placeholder: 'https://...',
                value: url, 'data-index': String(i)
            });
            inp.addEventListener('input', function () {
                state.form.evidenceUrls[parseInt(this.getAttribute('data-index'), 10)] = this.value;
            });
            item.appendChild(inp);
            item.appendChild(el('button', {
                className: 'btn btn-secondary btn-sm btn-remove', type: 'button', textContent: 'Remove',
                onClick: (function (idx) {
                    return function () {
                        state.form.evidenceUrls.splice(idx, 1);
                        renderReportWizard();
                    };
                })(i)
            }));
            evGroup.appendChild(item);
        });

        evGroup.appendChild(el('button', {
            className: 'btn btn-secondary btn-sm', type: 'button',
            textContent: rfc.addUrlLabel || '+ Add URL',
            onClick: function () {
                state.form.evidenceUrls.push('');
                renderReportWizard();
            }
        }));
        container.appendChild(evGroup);

        // Dynamic fields of type 'screenshot' or 'file-upload' from category
        var selectedCat = getSelectedCategoryData();
        var fields = selectedCat ? sortFields(selectedCat.fields) : [];
        fields.forEach(function (field) {
            var type = (field.type || '').toLowerCase();
            if (type === 'screenshot') {
                var fg = el('div', { className: 'form-group' });
                fg.appendChild(el('label', { className: 'form-label', textContent: field.label || 'Screenshot' }));
                var scVal = state.form.customFields[field.id] || state.form.screenshotUrl;
                if (scVal) {
                    fg.appendChild(el('div', { className: 'screenshot-status', textContent: 'Screenshot added' }));
                }
                var btn = el('button', {
                    className: 'btn btn-secondary', type: 'button',
                    textContent: scVal ? 'Retake' : 'Take screenshot',
                    onClick: function () {
                        var b = this;
                        b.disabled = true;
                        b.textContent = 'Taking screenshot...';
                        sendNuiCallback('requestScreenshotUpload', {}).then(function (data) {
                            b.disabled = false;
                            b.textContent = 'Take screenshot';
                            if (data && data.success && data.url) {
                                state.form.customFields[field.id] = data.url;
                                state.form.screenshotUrl = data.url;
                                if (state.form.evidenceUrls.indexOf(data.url) === -1) state.form.evidenceUrls.push(data.url);
                                renderReportWizard();
                            }
                        }).catch(function () {
                            b.disabled = false;
                            b.textContent = 'Take screenshot';
                        });
                    }
                });
                fg.appendChild(btn);
                container.appendChild(fg);
            } else if (type === 'file-upload') {
                var fg2 = el('div', { className: 'form-group' });
                fg2.appendChild(el('label', { className: 'form-label', textContent: field.label || 'File' }));
                fg2.appendChild(el('p', { className: 'form-hint', textContent: 'You can add evidence URLs above.' }));
                container.appendChild(fg2);
            }
        });
    }

    // ── Step 4: Review & Submit ──

    function renderStep4(container) {
        var categories = getCategories();
        var catLabel = '';
        categories.forEach(function (c) { if (c.id === state.form.category) catLabel = c.label; });

        // Category & Target section
        var sec1 = el('div', { className: 'review-section' });
        sec1.appendChild(buildReviewHeader('Category & Target', 1));
        sec1.appendChild(buildReviewField('Category', catLabel || state.form.category));
        if (state.form.targetMode === 'player' && state.form.targets.length) {
            var names = state.form.targets.map(function (t) { return t.name || ('ID:' + t.fivemId); }).join(', ');
            sec1.appendChild(buildReviewField('Target', names));
        } else if (state.form.targetMode === 'manual' && state.form.manualTarget) {
            sec1.appendChild(buildReviewField('Target', state.form.manualTarget));
        } else {
            sec1.appendChild(buildReviewField('Target', 'No specific player'));
        }
        container.appendChild(sec1);

        // Details section
        var sec2 = el('div', { className: 'review-section' });
        sec2.appendChild(buildReviewHeader('Details', 2));
        sec2.appendChild(buildReviewField('Subject', state.form.subject));
        var descPreview = state.form.description;
        if (descPreview.length > 150) descPreview = descPreview.substring(0, 150) + '...';
        sec2.appendChild(buildReviewField('Description', descPreview));
        sec2.appendChild(buildReviewField('Severity', state.form.severity.charAt(0).toUpperCase() + state.form.severity.slice(1)));

        // Custom fields
        var selectedCat = getSelectedCategoryData();
        var fields = selectedCat ? sortFields(selectedCat.fields) : [];
        fields.forEach(function (f) {
            var type = (f.type || '').toLowerCase();
            if (type === 'screenshot' || type === 'file-upload') return;
            var val = state.form.customFields[f.id];
            if (val) sec2.appendChild(buildReviewField(f.label || f.id, String(val)));
        });
        container.appendChild(sec2);

        // Evidence section
        var allUrls = gatherAttachments();
        var sec3 = el('div', { className: 'review-section' });
        sec3.appendChild(buildReviewHeader('Evidence', 3));
        if (state.form.screenshotUrl) {
            sec3.appendChild(buildReviewField('Screenshot', 'Captured'));
        }
        sec3.appendChild(buildReviewField('Evidence URLs', allUrls.length > 0 ? allUrls.length + ' link(s)' : 'None'));
        container.appendChild(sec3);

        // Next info
        container.appendChild(el('div', {
            className: 'review-next-info',
            textContent: 'After submitting, staff will be notified and your report will be reviewed. You can check the status of your report using /reportstatus in-game.'
        }));
    }

    function buildReviewHeader(title, stepNum) {
        var header = el('div', { className: 'review-section-header' });
        header.appendChild(el('span', { className: 'review-section-title', textContent: title }));
        header.appendChild(el('button', {
            className: 'review-edit-btn', type: 'button', textContent: 'Edit',
            onClick: function () { state.reportStep = stepNum; renderReportWizard(); }
        }));
        return header;
    }

    function buildReviewField(label, value) {
        return el('div', { className: 'review-field' }, [
            el('div', { className: 'review-field-label', textContent: label }),
            el('div', { className: 'review-field-value', textContent: escapeText(value || '--') })
        ]);
    }

    function showReportToast(msg) {
        var body = appRoot.querySelector('.modal-body');
        if (!body) return;
        var existing = body.querySelector('.toast');
        if (existing) existing.remove();
        var toast = el('div', { className: 'toast toast-error', textContent: msg });
        body.insertBefore(toast, body.firstChild);
    }

    // ── Validation ──

    function validateStep(step) {
        clearValidationErrors();
        var errors = {};

        if (step === 1) {
            if (!state.form.category) errors.category = 'Select a category';
        }

        if (step === 2) {
            var sub = (state.form.subject || '').trim();
            if (!sub) errors.subject = 'Subject is required';
            else if (sub.length > 80) errors.subject = 'Subject must be 80 characters or less';

            var desc = (state.form.description || '').trim();
            if (!desc || desc.length < 20) errors.description = 'Description must be at least 20 characters';
            else if (desc.length > 2000) errors.description = 'Description must be 2000 characters or less';

            // Validate required custom fields
            var selectedCat = getSelectedCategoryData();
            if (selectedCat && selectedCat.fields) {
                selectedCat.fields.forEach(function (field) {
                    var type = (field.type || '').toLowerCase();
                    if (type === 'screenshot' || type === 'file-upload') return;
                    if (field.required) {
                        var val = state.form.customFields[field.id];
                        if (val === undefined || val === null || String(val).trim() === '') {
                            errors['field_' + field.id] = (field.label || field.id) + ' is required';
                        }
                    }
                });
            }
        }

        // Show errors
        var keys = Object.keys(errors);
        if (keys.length === 0) return true;

        keys.forEach(function (key) {
            if (key.indexOf('field_') === 0) {
                var fid = key.substring(6);
                var errEl = appRoot.querySelector('[data-field-error="' + fid + '"]');
                if (errEl) { errEl.textContent = errors[key]; errEl.classList.remove('hidden'); }
            } else {
                var errEl2 = document.getElementById('err-' + key);
                if (errEl2) { errEl2.textContent = errors[key]; errEl2.classList.remove('hidden'); }
            }
        });

        // Show first error as toast
        showReportToast(errors[keys[0]]);
        return false;
    }

    function clearValidationErrors() {
        var errs = appRoot.querySelectorAll('.form-error');
        for (var i = 0; i < errs.length; i++) {
            errs[i].textContent = '';
            errs[i].classList.add('hidden');
        }
        var toast = appRoot.querySelector('.toast');
        if (toast) toast.remove();
    }

    // ── Submit ──

    function gatherAttachments() {
        var allUrls = state.form.evidenceUrls.filter(Boolean).slice();
        if (state.form.screenshotUrl && allUrls.indexOf(state.form.screenshotUrl) === -1) {
            allUrls.push(state.form.screenshotUrl);
        }
        // Deduplicate
        var unique = [];
        for (var i = 0; i < allUrls.length; i++) {
            if (unique.indexOf(allUrls[i]) === -1) unique.push(allUrls[i]);
        }
        return unique;
    }

    function submitReport() {
        if (!state.playerData) {
            showReportToast('Player data not loaded. Try reopening the report form.');
            return;
        }

        var attachments = gatherAttachments();

        // Build targets
        var targets = [];
        if (state.form.targetMode === 'player') {
            targets = state.form.targets;
        } else if (state.form.targetMode === 'manual' && state.form.manualTarget.trim()) {
            targets = [{ name: state.form.manualTarget.trim(), fivemId: 0 }];
        }

        // Resolve subject/description from custom fields if applicable
        var subject = state.form.subject.trim();
        var description = state.form.description.trim();
        var selectedCat = getSelectedCategoryData();
        if (selectedCat && selectedCat.fields) {
            var subjectField = selectedCat.fields.find(function (f) { return (f.type || '').toLowerCase() === 'text' && (f.label || '').toLowerCase().indexOf('subject') !== -1; });
            var descField = selectedCat.fields.find(function (f) { return (f.type || '').toLowerCase() === 'textarea' && (f.label || '').toLowerCase().indexOf('description') !== -1; });
            if (subjectField && state.form.customFields[subjectField.id]) subject = String(state.form.customFields[subjectField.id]);
            if (descField && state.form.customFields[descField.id]) description = String(state.form.customFields[descField.id]);
        }
        if (!subject) subject = 'Report';

        var priorityMap = { low: 'low', medium: 'normal', high: 'high', critical: 'urgent' };

        var reportData = {
            category: state.form.category,
            subject: subject,
            description: description,
            priority: priorityMap[state.form.severity] || 'normal',
            severity: state.form.severity,
            reporter: {
                fivemId: state.playerData.fivemId,
                name: state.playerData.name,
                identifiers: state.playerData.identifiers || {},
                position: state.playerData.position || null
            },
            targets: targets,
            attachments: attachments,
            customFields: state.form.customFields || {},
            evidenceUrls: attachments,
            meta: {
                severity: state.form.severity
            }
        };

        // Disable submit button
        var submitBtn = appRoot.querySelector('.modal-footer .btn-primary');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting...'; }

        sendNuiCallback('submitReport', reportData).then(function (data) {
            if (data && data.success) {
                // Wait for reportSubmitted event from Lua for final result
            } else {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit report'; }
                showReportToast((data && data.error) || 'Submit failed. Try again.');
            }
        }).catch(function () {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit report'; }
            showReportToast('Failed to send report. Try again.');
        });
    }

    function handleReportSubmitted(payload) {
        var success = payload && payload.success;
        var ticketNumber = payload && payload.ticketNumber;
        var ticketUrl = payload && payload.ticketUrl;
        var error = payload && payload.error;
        var cooldownSeconds = payload && payload.cooldownSeconds;

        if (success) {
            state.lastSuccess = { ticketNumber: ticketNumber, ticketUrl: ticketUrl };
            renderReportSuccess(ticketNumber, ticketUrl);
        } else {
            renderReportError(escapeText(error || 'Report could not be sent.'));
            if (cooldownSeconds != null && cooldownSeconds > 0) {
                state.cooldownRemaining = cooldownSeconds;
                showReportToast('You can report again in ' + cooldownSeconds + ' seconds.');
            }
        }
    }

    // ════════════════════════════════════════
    // ██ REPORT STATUS VIEW
    // ════════════════════════════════════════

    function openStatusView() {
        state.activeView = 'status';
        state.reports = [];
        state.expandedReportId = null;
        renderStatusView();

        // Request statuses from Lua
        sendNuiCallback('refreshStatuses', {}).catch(function () { });
    }

    function closeStatusView() {
        closeAll();
        sendNuiCallback('closeStatus', {}).catch(function () { });
    }

    function updateStatuses(reports) {
        state.reports = reports || [];
        if (state.activeView === 'status') {
            renderStatusView();
        }
    }

    function renderStatusView() {
        clearApp();
        appRoot.appendChild(buildBackdrop(closeStatusView));

        var modal = el('div', { className: 'modal modal-status' });
        modal.appendChild(buildModalHeader('My Reports', 'View the status of your reports', closeStatusView));

        var body = el('div', { className: 'modal-body' });

        if (state.reports.length === 0) {
            body.appendChild(el('div', { className: 'empty-state' }, [
                el('div', { className: 'empty-state-icon', textContent: '\uD83D\uDCCB' }),
                el('div', { className: 'empty-state-title', textContent: 'No reports found' }),
                el('div', { className: 'empty-state-text', textContent: 'You have not submitted any reports yet, or they are no longer available.' })
            ]));
        } else {
            state.reports.forEach(function (report) {
                body.appendChild(buildReportCard(report));
            });
        }

        modal.appendChild(body);

        // Footer with refresh + close
        var footer = el('div', { className: 'modal-footer' });
        footer.appendChild(el('div', { className: 'modal-footer-hint' }));
        var actions = el('div', { className: 'modal-footer-actions' });
        actions.appendChild(el('button', {
            className: 'btn btn-secondary', type: 'button', textContent: 'Refresh',
            onClick: function () {
                sendNuiCallback('refreshStatuses', {}).catch(function () { });
            }
        }));
        actions.appendChild(el('button', {
            className: 'btn btn-primary', type: 'button', textContent: 'Close',
            onClick: closeStatusView
        }));
        footer.appendChild(actions);
        modal.appendChild(footer);

        appRoot.appendChild(modal);
    }

    function buildReportCard(report) {
        // API returns snake_case keys; keep camelCase fallbacks for backwards compatibility.
        var reportId = report.report_id != null ? report.report_id : report.id;
        var categoryLabel = report.category_label || report.category;
        var createdAt = report.created_at || report.createdAt;
        var lastUpdatedAt = report.last_updated_at || report.updatedAt || createdAt;
        var lastPublicUpdate = report.last_public_update || report.lastPublicUpdate;
        var evidenceCount = report.evidence_count != null ? report.evidence_count : report.evidenceCount;
        // Live Discord channel only exists while the ticket is open; null once resolved/closed.
        var channelName = report.channel_name || report.channelName;

        var ticketNumber = report.ticket_number != null ? report.ticket_number : report.ticketNumber;

        var isExpanded = state.expandedReportId === reportId;
        var card = el('div', { className: 'report-card' + (isExpanded ? ' expanded' : '') });

        // Header row: report id + badge. The id is always shown; the Discord channel
        // name is extra context and only exists while the ticket is still live.
        var header = el('div', { className: 'report-card-header' });
        var identity = el('div', { className: 'report-card-identity' });
        var idText = ticketNumber != null ? ('#' + ticketNumber) : (reportId != null ? ('#' + reportId) : '');
        if (idText) {
            identity.appendChild(el('span', { className: 'report-card-id', textContent: idText }));
        }
        if (channelName) {
            identity.appendChild(el('span', { className: 'report-card-channel', textContent: escapeText(channelName) }));
        }
        header.appendChild(identity);

        var statusText = (report.status || 'open').replace(/_/g, ' ');
        statusText = statusText.charAt(0).toUpperCase() + statusText.slice(1);
        var badgeClass = 'status-badge status-badge-' + (report.status || 'open').toLowerCase().replace(/\s+/g, '_');
        header.appendChild(el('span', { className: badgeClass, textContent: statusText }));
        card.appendChild(header);

        // Subject
        card.appendChild(el('div', { className: 'report-card-subject', textContent: escapeText(report.subject || 'Report') }));

        // Meta
        var meta = el('div', { className: 'report-card-meta' });
        if (categoryLabel) meta.appendChild(el('span', { textContent: escapeText(categoryLabel) }));
        if (lastUpdatedAt) {
            meta.appendChild(el('span', { textContent: formatTimeAgo(lastUpdatedAt) }));
        }
        card.appendChild(meta);

        // Expanded details
        var expanded = el('div', { className: 'report-card-expanded' });
        if (reportId != null) expanded.appendChild(buildDetailRow('Report ID', reportId));
        if (categoryLabel) expanded.appendChild(buildDetailRow('Category', categoryLabel));
        if (report.severity) expanded.appendChild(buildDetailRow('Severity', report.severity.charAt(0).toUpperCase() + report.severity.slice(1)));
        if (lastPublicUpdate) expanded.appendChild(buildDetailRow('Last update', lastPublicUpdate));
        if (report.outcome) expanded.appendChild(buildDetailRow('Outcome', report.outcome));
        if (evidenceCount != null) expanded.appendChild(buildDetailRow('Evidence', evidenceCount + ' item(s)'));
        if (createdAt) expanded.appendChild(buildDetailRow('Submitted', formatTimeAgo(createdAt)));
        card.appendChild(expanded);

        // Click to toggle expand
        card.addEventListener('click', function () {
            if (state.expandedReportId === reportId) {
                state.expandedReportId = null;
            } else {
                state.expandedReportId = reportId;
            }
            renderStatusView();
        });

        return card;
    }

    function buildDetailRow(label, value) {
        return el('div', { className: 'report-detail-row' }, [
            el('span', { className: 'report-detail-label', textContent: label }),
            el('span', { className: 'report-detail-value', textContent: escapeText(String(value)) })
        ]);
    }

    // ════════════════════════════════════════
    // ██ SERVER STATS VIEW
    // ════════════════════════════════════════

    function openStatsView(data) {
        state.activeView = 'stats';
        renderStatsView(data.stats || data || {});
    }

    function closeStatsView() {
        closeAll();
        sendNuiCallback('closeServerStats', {}).catch(function () { });
    }

    function renderStatsView(stats) {
        clearApp();
        appRoot.appendChild(buildBackdrop(closeStatsView));

        var modal = el('div', { className: 'modal modal-stats' });
        modal.appendChild(buildModalHeader('Server Stats', 'Uptime, resources & recent errors', closeStatsView));

        var body = el('div', { className: 'modal-body' });

        // Stats grid
        var grid = el('div', { className: 'stats-grid' });
        grid.appendChild(buildStatItem('Server', stats.serverName || '--'));
        grid.appendChild(buildStatItem('Uptime', formatUptime(stats.uptimeSeconds)));
        grid.appendChild(buildStatItem('Players', stats.playerCount != null ? String(stats.playerCount) : '--'));
        grid.appendChild(buildStatItem('Resources', stats.resourceCount != null ? String(stats.resourceCount) : '--'));

        var memText = '--';
        if (stats.memoryKb != null && stats.memoryKb >= 0) {
            var mb = stats.memoryKb / 1024;
            memText = mb >= 1 ? mb.toFixed(1) + ' MB' : stats.memoryKb + ' KB';
        }
        grid.appendChild(buildStatItem('Memory (Lua)', memText));

        var hostMemText = '--';
        if (stats.hostMemoryMb != null && stats.hostMemoryMb >= 0) {
            hostMemText = stats.hostMemoryLuaFallback ? (stats.hostMemoryMb + ' MB (Lua)') : (stats.hostMemoryMb + ' MB');
        }
        grid.appendChild(buildStatItem('RAM (host)', hostMemText));

        var cpuText = (stats.hostCpuPercent != null && stats.hostCpuPercent >= 0) ? (stats.hostCpuPercent + '%') : '--';
        grid.appendChild(buildStatItem('CPU', cpuText));
        body.appendChild(grid);

        // Version
        if (stats.serverVersion) {
            body.appendChild(el('p', { className: 'stat-version', textContent: 'Version: ' + escapeText(String(stats.serverVersion).substring(0, 50)) }));
        }

        // Errors
        var errors = stats.lastErrors || [];
        var errSection = el('div', { className: 'errors-section' });
        errSection.appendChild(el('h3', { className: 'errors-title', textContent: 'Last 5 errors' }));

        if (errors.length === 0) {
            errSection.appendChild(el('p', { className: 'no-errors', textContent: 'No recent errors recorded.' }));
        } else {
            var list = el('ul', { className: 'errors-list' });
            errors.slice(0, 5).forEach(function (msg) {
                list.appendChild(el('li', { className: 'error-item', textContent: escapeText(msg) }));
            });
            errSection.appendChild(list);
        }
        body.appendChild(errSection);
        modal.appendChild(body);

        // Footer
        var footer = el('div', { className: 'modal-footer' });
        footer.appendChild(el('div', { className: 'modal-footer-hint' }));
        var actions = el('div', { className: 'modal-footer-actions' });
        actions.appendChild(el('button', {
            className: 'btn btn-primary', type: 'button', textContent: 'Close',
            onClick: closeStatsView
        }));
        footer.appendChild(actions);
        modal.appendChild(footer);

        appRoot.appendChild(modal);
    }

    function buildStatItem(label, value) {
        return el('div', { className: 'stat-item' }, [
            el('span', { className: 'stat-label', textContent: label }),
            el('span', { className: 'stat-value', textContent: escapeText(String(value)) })
        ]);
    }

    // ════════════════════════════════════════
    // ██ STAFF PANEL VIEW
    // ════════════════════════════════════════

    var staffState = {
        tab: 'players',   // 'players' | 'reports' | 'actions'
        players: [],
        reportData: null,
        searchQuery: '',
        selectedBulk: [],
        reasonModal: null  // { actionType, targetId, targetName }
    };

    function openStaffPanel() {
        state.activeView = 'staff';
        staffState.tab = 'players';
        staffState.players = [];
        staffState.reportData = null;
        staffState.searchQuery = '';
        staffState.selectedBulk = [];
        staffState.reasonModal = null;
        renderStaffPanel();
    }

    function closeStaffPanel() {
        closeAll();
        staffState.reasonModal = null;
        sendNuiCallback('closeStaff', {}).catch(function () { });
    }

    function renderStaffPanel() {
        clearApp();
        appRoot.appendChild(buildBackdrop(closeStaffPanel));

        var modal = el('div', { className: 'modal modal-staff' });
        modal.appendChild(buildModalHeader('Staff Panel', 'Moderation tools', closeStaffPanel));

        // Tab bar
        var tabs = el('div', { className: 'staff-tabs' });
        var tabDefs = [
            { id: 'players', label: 'Players' },
            { id: 'reports', label: 'Reports' },
            { id: 'actions', label: 'Quick Actions' }
        ];
        tabDefs.forEach(function (t) {
            tabs.appendChild(el('button', {
                className: 'staff-tab' + (staffState.tab === t.id ? ' active' : ''),
                type: 'button',
                textContent: t.label,
                onClick: function () {
                    staffState.tab = t.id;
                    renderStaffPanel();
                }
            }));
        });
        modal.appendChild(tabs);

        // Content
        var content = el('div', { className: 'staff-content' });
        switch (staffState.tab) {
            case 'players':
                renderStaffPlayersTab(content);
                break;
            case 'reports':
                renderStaffReportsTab(content);
                break;
            case 'actions':
                renderStaffActionsTab(content);
                break;
        }
        modal.appendChild(content);

        appRoot.appendChild(modal);

        // Render reason modal overlay if active
        if (staffState.reasonModal) {
            renderReasonModal();
        }
    }

    // ── Players Tab ──

    function renderStaffPlayersTab(container) {
        var toolbar = el('div', { className: 'staff-toolbar' });
        var toolbarLeft = el('div', { className: 'staff-toolbar-left' });

        var searchInput = el('input', {
            className: 'staff-search',
            type: 'text',
            placeholder: 'Search players...',
            value: staffState.searchQuery
        });
        searchInput.value = staffState.searchQuery;
        searchInput.addEventListener('input', function () {
            staffState.searchQuery = this.value;
            // Re-render just the player list portion
            var listEl = document.getElementById('staff-player-list');
            if (listEl) {
                listEl.innerHTML = '';
                buildPlayerRows(listEl);
            }
            // Update count
            var countEl = document.getElementById('staff-player-count');
            if (countEl) {
                var filtered = getFilteredPlayers();
                countEl.textContent = filtered.length + ' / ' + staffState.players.length + ' players';
            }
        });
        toolbarLeft.appendChild(searchInput);

        var filtered = getFilteredPlayers();
        toolbarLeft.appendChild(el('span', {
            className: 'staff-count',
            id: 'staff-player-count',
            textContent: filtered.length + ' / ' + staffState.players.length + ' players'
        }));
        toolbar.appendChild(toolbarLeft);

        toolbar.appendChild(el('button', {
            className: 'btn btn-sm btn-secondary',
            type: 'button',
            textContent: 'Refresh',
            onClick: function () {
                sendNuiCallback('staffRefreshPlayers', {}).catch(function () { });
            }
        }));
        container.appendChild(toolbar);

        if (staffState.players.length === 0) {
            container.appendChild(el('div', { className: 'loading-state' }, [
                el('div', { className: 'spinner' }),
                el('span', { textContent: 'Loading players...' })
            ]));
            return;
        }

        var listWrapper = el('div', { id: 'staff-player-list' });
        buildPlayerRows(listWrapper);
        container.appendChild(listWrapper);
    }

    function getFilteredPlayers() {
        var q = staffState.searchQuery.toLowerCase().trim();
        if (!q) return staffState.players;
        return staffState.players.filter(function (p) {
            return (p.name && p.name.toLowerCase().indexOf(q) !== -1) ||
                   String(p.id).indexOf(q) !== -1;
        });
    }

    function buildPlayerRows(container) {
        var filtered = getFilteredPlayers();
        if (filtered.length === 0) {
            container.appendChild(el('div', { className: 'empty-state' }, [
                el('div', { className: 'empty-state-title', textContent: 'No players found' }),
                el('div', { className: 'empty-state-text', textContent: staffState.searchQuery ? 'Try a different search term' : 'No players online' })
            ]));
            return;
        }
        filtered.forEach(function (player) {
            var pingClass = 'player-row-ping';
            if (player.ping < 80) pingClass += ' good';
            else if (player.ping < 150) pingClass += ' medium';
            else pingClass += ' bad';

            var actions = el('div', { className: 'player-actions' });
            var actionDefs = [
                { type: 'tp', label: 'TP', needsReason: false },
                { type: 'warn', label: 'Warn', needsReason: true },
                { type: 'kick', label: 'Kick', needsReason: true },
                { type: 'ban', label: 'Ban', needsReason: true },
                { type: 'freeze', label: 'Freeze', needsReason: false },
                { type: 'spectate', label: 'Spec', needsReason: false }
            ];

            actionDefs.forEach(function (act) {
                actions.appendChild(el('button', {
                    className: 'action-btn ' + act.type,
                    type: 'button',
                    textContent: act.label,
                    onClick: function () {
                        if (act.needsReason) {
                            staffState.reasonModal = {
                                actionType: act.type,
                                targetId: player.id,
                                targetName: player.name
                            };
                            renderReasonModal();
                        } else {
                            sendNuiCallback('staffAction', {
                                type: act.type,
                                targetId: player.id
                            }).catch(function () { });
                        }
                    }
                }));
            });

            var row = el('div', { className: 'player-row' }, [
                el('span', { className: 'player-row-id', textContent: '#' + player.id }),
                el('div', { className: 'player-row-info' }, [
                    el('span', { className: 'player-row-name', textContent: escapeText(player.name) }),
                    el('div', { className: 'player-row-meta' }, [
                        el('span', { className: pingClass, textContent: player.ping + 'ms' }),
                        player.identifiers && player.identifiers.discord
                            ? el('span', { textContent: 'Discord: ' + escapeText(player.identifiers.discord) })
                            : null
                    ])
                ]),
                actions
            ]);
            container.appendChild(row);
        });
    }

    // ── Reason Modal ──

    function renderReasonModal() {
        // Remove existing overlay if any
        var existing = document.querySelector('.reason-overlay');
        if (existing) existing.remove();

        var rm = staffState.reasonModal;
        if (!rm) return;

        var reasonText = '';
        var overlay = el('div', { className: 'reason-overlay' });
        var modal = el('div', { className: 'reason-modal' });

        var title = rm.actionType.charAt(0).toUpperCase() + rm.actionType.slice(1) + ' — ' + escapeText(rm.targetName);
        modal.appendChild(el('h3', { textContent: title }));

        var textarea = el('textarea', {
            className: 'form-textarea',
            placeholder: 'Enter reason...',
            rows: '3'
        });
        textarea.addEventListener('input', function () { reasonText = this.value; });
        modal.appendChild(textarea);

        var actions = el('div', { className: 'reason-modal-actions' });
        actions.appendChild(el('button', {
            className: 'btn btn-sm btn-secondary',
            type: 'button',
            textContent: 'Cancel',
            onClick: function () {
                staffState.reasonModal = null;
                overlay.remove();
            }
        }));
        actions.appendChild(el('button', {
            className: 'btn btn-sm btn-' + (rm.actionType === 'ban' ? 'danger' : 'primary'),
            type: 'button',
            textContent: 'Confirm ' + rm.actionType,
            onClick: function () {
                sendNuiCallback('staffAction', {
                    type: rm.actionType,
                    targetId: rm.targetId,
                    reason: reasonText || 'No reason provided'
                }).catch(function () { });
                staffState.reasonModal = null;
                overlay.remove();
            }
        }));
        modal.appendChild(actions);
        overlay.appendChild(modal);

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) {
                staffState.reasonModal = null;
                overlay.remove();
            }
        });

        document.body.appendChild(overlay);
        setTimeout(function () { textarea.focus(); }, 50);
    }

    // ── Reports Tab ──

    function renderStaffReportsTab(container) {
        var toolbar = el('div', { className: 'staff-toolbar' });
        toolbar.appendChild(el('span', { className: 'staff-count', textContent: 'Report statistics from API' }));
        toolbar.appendChild(el('button', {
            className: 'btn btn-sm btn-secondary',
            type: 'button',
            textContent: 'Refresh',
            onClick: function () {
                sendNuiCallback('staffRefreshReports', {}).catch(function () { });
            }
        }));
        container.appendChild(toolbar);

        if (!staffState.reportData) {
            container.appendChild(el('div', { className: 'loading-state' }, [
                el('div', { className: 'spinner' }),
                el('span', { textContent: 'Loading reports...' })
            ]));
            return;
        }

        var stats = staffState.reportData.stats || {};
        if (staffState.reportData.error) {
            container.appendChild(el('div', { className: 'toast toast-error', textContent: staffState.reportData.error }));
        }

        // Stats summary cards
        var grid = el('div', { className: 'staff-stats-grid' });
        var statPairs = [
            ['Pending', stats.pending_reports || stats.pendingReports || 0],
            ['Open', stats.open_reports || stats.openReports || 0],
            ['In Review', stats.in_review_reports || stats.inReviewReports || 0],
            ['Resolved', stats.resolved_reports || stats.resolvedReports || 0],
            ['Total', stats.total_reports || stats.totalReports || 0],
            ['Today', stats.today_reports || stats.todayReports || 0]
        ];
        statPairs.forEach(function (pair) {
            grid.appendChild(el('div', { className: 'staff-stat-card' }, [
                el('span', { className: 'staff-stat-value', textContent: String(pair[1]) }),
                el('span', { className: 'staff-stat-label', textContent: pair[0] })
            ]));
        });
        container.appendChild(grid);

        // Hint
        container.appendChild(el('div', { className: 'review-next-info', textContent: 'Detailed report management is available on the Modora dashboard at modora.gg. This view shows a summary of report statistics.' }));
    }

    // ── Quick Actions Tab ──

    function renderStaffActionsTab(container) {
        container.appendChild(el('p', {
            className: 'form-hint',
            textContent: 'Common moderation shortcuts. These execute immediately.',
            style: 'margin-bottom: 16px;'
        }));

        var actionDefs = [
            { label: 'Refresh Player List', desc: 'Reload all online players', callback: function () { sendNuiCallback('staffRefreshPlayers', {}).catch(function () { }); showStaffNotification('Player list refreshed', 'info'); } },
            { label: 'Refresh Reports', desc: 'Reload report statistics from API', callback: function () { sendNuiCallback('staffRefreshReports', {}).catch(function () { }); showStaffNotification('Reports refreshed', 'info'); } }
        ];

        actionDefs.forEach(function (act) {
            var card = el('div', {
                className: 'report-card',
                onClick: act.callback
            }, [
                el('div', { className: 'report-card-subject', textContent: act.label }),
                el('div', { className: 'report-card-meta' }, [
                    el('span', { textContent: act.desc })
                ])
            ]);
            container.appendChild(card);
        });
    }

    // ── Staff Toast Notification ──

    function showStaffNotification(message, type) {
        type = type || 'info';
        // Remove existing toasts
        document.querySelectorAll('.staff-toast').forEach(function (t) { t.remove(); });

        var toast = el('div', {
            className: 'staff-toast ' + type,
            textContent: message
        });
        document.body.appendChild(toast);
        setTimeout(function () {
            if (toast.parentNode) toast.remove();
        }, 4000);
    }

    // ════════════════════════════════════════
    // ██ NUI MESSAGE ROUTER
    // ════════════════════════════════════════

    window.addEventListener('message', function (event) {
        var data = event.data;

        // New unified actions
        switch (data.action) {
            case 'INIT':
                state.init = {
                    serverName: data.serverName,
                    cooldownRemaining: data.cooldownRemaining,
                    playerName: data.playerName,
                    theme: data.theme,
                    version: data.version
                };
                return;

            case 'OPEN_STATUS':
                openStatusView();
                return;

            case 'STATUS_UPDATE':
                updateStatuses(data.reports);
                return;

            case 'OPEN_STATS':
                openStatsView(data);
                return;

            case 'OPEN_STAFF':
                openStaffPanel();
                return;

            case 'CLOSE_STAFF':
                if (state.activeView === 'staff') closeStaffPanel();
                return;

            case 'STAFF_PLAYERS_UPDATE':
                staffState.players = data.players || [];
                if (state.activeView === 'staff') renderStaffPanel();
                return;

            case 'STAFF_REPORTS_UPDATE':
                staffState.reportData = data.data || data;
                if (state.activeView === 'staff') renderStaffPanel();
                return;

            case 'STAFF_ACTION_RESULT':
                if (data.result) {
                    showStaffNotification(
                        data.result.message || data.result.error || 'Action completed',
                        data.result.success ? 'success' : 'error'
                    );
                }
                return;

            case 'STAFF_NOTIFICATION':
                if (data.notification) {
                    showStaffNotification(
                        data.notification.message || 'Notification',
                        data.notification.type || 'info'
                    );
                }
                return;

            case 'CLOSE':
                if (state.activeView === 'report') sendNuiCallback('closeReport', {}).catch(function () { });
                else if (state.activeView === 'status') sendNuiCallback('closeStatus', {}).catch(function () { });
                else if (state.activeView === 'stats') sendNuiCallback('closeServerStats', {}).catch(function () { });
                else if (state.activeView === 'staff') sendNuiCallback('closeStaff', {}).catch(function () { });
                closeAll();
                return;
        }

        // Backward-compatible actions
        if (data.action === 'openReport') {
            if (data.type === 'INIT') {
                state.init = state.init || {};
                state.init.serverName = data.serverName || (state.init && state.init.serverName);
                state.init.cooldownRemaining = data.cooldownRemaining != null ? data.cooldownRemaining : (state.init && state.init.cooldownRemaining);
                state.init.playerName = data.playerName || (state.init && state.init.playerName);
            }
            openReportForm(data);
        } else if (data.action === 'closeReport') {
            if (state.activeView === 'report') closeReportForm();
        } else if (data.action === 'reportSubmitted') {
            handleReportSubmitted(data);
        } else if (data.action === 'screenshotReady' && data.url) {
            if (state.form.evidenceUrls.indexOf(data.url) === -1) state.form.evidenceUrls.push(data.url);
            state.form.screenshotUrl = data.url;
            if (state.activeView === 'report') renderReportWizard();
        } else if (data.action === 'openServerStats') {
            openStatsView({ stats: data.stats || {} });
        } else if (data.action === 'closeServerStats') {
            if (state.activeView === 'stats') closeStatsView();
        }
    });

    // ── Keyboard ──

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            // Close reason modal first if open
            if (staffState.reasonModal) {
                staffState.reasonModal = null;
                var overlay = document.querySelector('.reason-overlay');
                if (overlay) overlay.remove();
                return;
            }
            if (state.activeView === 'report') closeReportForm();
            else if (state.activeView === 'status') closeStatusView();
            else if (state.activeView === 'stats') closeStatsView();
            else if (state.activeView === 'staff') closeStaffPanel();
        }
    });
})();
