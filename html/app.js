(function() {
    'use strict';

    var RESOURCE_NAME = 'modora-admin';

    function getParentResourceName() {
        if (typeof GetParentResourceName === 'function') {
            return GetParentResourceName();
        }
        return RESOURCE_NAME;
    }

    var state = {
        view: 'closed',
        init: null,
        playerData: null,
        serverConfig: null,
        form: {
            category: '',
            subject: '',
            description: '',
            evidenceUrls: [],
            targets: [],
            customFields: {},
            screenshotUrl: null
        },
        cooldownRemaining: 0,
        lastSuccess: null
    };

    var DEFAULT_CATEGORIES = [
        { id: 'scam', label: 'Scam' },
        { id: 'harassment', label: 'Harassment' },
        { id: 'exploit', label: 'Exploit' },
        { id: 'cheating', label: 'Cheating' },
        { id: 'other', label: 'Other' }
    ];

    function escapeText(str) {
        if (str == null || typeof str !== 'string') return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function showView(viewName) {
        state.view = viewName;
        var app = document.getElementById('app');
        var loading = document.getElementById('stateLoading');
        var form = document.getElementById('stateForm');
        var success = document.getElementById('stateSuccess');

        if (!app) return;
        app.classList.remove('hidden');

        if (loading) loading.classList.add('hidden');
        if (form) form.classList.add('hidden');
        if (success) success.classList.add('hidden');

        switch (viewName) {
            case 'loading':
                if (loading) loading.classList.remove('hidden');
                break;
            case 'form':
            case 'submitting':
                if (form) form.classList.remove('hidden');
                var btn = document.getElementById('btnSubmit');
                if (btn) btn.disabled = (viewName === 'submitting');
                break;
            case 'success':
            case 'error':
                if (success) success.classList.remove('hidden');
                break;
            case 'closed':
                app.classList.add('hidden');
                break;
        }
    }

    function sendNuiCallback(name, data) {
        data = data || {};
        return fetch('https://' + getParentResourceName() + '/' + name, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).then(function(res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        });
    }

    function requestPlayerData() {
        return sendNuiCallback('requestPlayerData', {}).then(function(data) {
            if (data && data.success && data.playerData) {
                state.playerData = data.playerData;
                return state.playerData;
            }
            throw new Error('No player data');
        });
    }

    function requestServerConfig() {
        return sendNuiCallback('requestServerConfig', {}).then(function(data) {
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
            return rfc.categories.map(function(c) {
                return { id: c.id, label: c.label || c.id, fields: c.fields || [] };
            });
        }
        var cats = (state.serverConfig && state.serverConfig.categories) || DEFAULT_CATEGORIES;
        return cats.map(function(c) {
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
        return fields.slice().sort(function(a, b) {
            var oa = a.order != null ? a.order : 999;
            var ob = b.order != null ? b.order : 999;
            return oa - ob;
        });
    }

    function renderFormContent() {
        var container = document.getElementById('formContent');
        if (!container) return;

        var categories = getCategories();
        var rfc = state.serverConfig && state.serverConfig.reportFormConfig;
        var selectedCat = getSelectedCategoryData();
        var fields = selectedCat ? sortFields(selectedCat.fields) : [];

        container.innerHTML = '';

        // Category
        var sectionCat = document.createElement('div');
        sectionCat.className = 'modora-form-section';
        var labelCat = document.createElement('label');
        labelCat.className = 'modora-label';
        labelCat.setAttribute('for', 'category');
        labelCat.textContent = 'Category';
        var selectCat = document.createElement('select');
        selectCat.id = 'category';
        selectCat.className = 'modora-select';
        selectCat.innerHTML = '<option value="">Select category...</option>';
        categories.forEach(function(c) {
            var opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.label;
            if (c.id === state.form.category) opt.selected = true;
            selectCat.appendChild(opt);
        });
        selectCat.addEventListener('change', function() {
            state.form.category = this.value;
            state.form.customFields = {};
            renderFormContent();
            renderNearbyPlayers();
        });
        var errCat = document.createElement('div');
        errCat.id = 'categoryError';
        errCat.className = 'modora-error hidden';
        sectionCat.appendChild(labelCat);
        sectionCat.appendChild(selectCat);
        sectionCat.appendChild(errCat);
        container.appendChild(sectionCat);

        // Dynamic fields from reportFormConfig
        if (fields.length) {
            var wrapFields = document.createElement('div');
            wrapFields.className = 'modora-dynamic-fields';
            fields.forEach(function(field) {
                var section = document.createElement('div');
                section.className = 'modora-form-section';
                section.setAttribute('data-field-id', field.id);

                var label = document.createElement('label');
                label.className = 'modora-label';
                label.textContent = field.label || field.id;
                if (field.required) label.textContent += ' *';
                section.appendChild(label);

                var type = (field.type || 'text').toLowerCase();
                var value = state.form.customFields[field.id];

                if (type === 'text') {
                    var input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'modora-input';
                    input.placeholder = field.placeholder || '';
                    input.value = value != null ? value : '';
                    input.setAttribute('data-field-id', field.id);
                    input.addEventListener('input', function() {
                        state.form.customFields[field.id] = this.value;
                    });
                    section.appendChild(input);
                } else if (type === 'textarea') {
                    var ta = document.createElement('textarea');
                    ta.className = 'modora-textarea';
                    ta.placeholder = field.placeholder || '';
                    ta.value = value != null ? value : '';
                    ta.setAttribute('data-field-id', field.id);
                    ta.addEventListener('input', function() {
                        state.form.customFields[field.id] = this.value;
                    });
                    section.appendChild(ta);
                } else if (type === 'select') {
                    var sel = document.createElement('select');
                    sel.className = 'modora-select';
                    sel.setAttribute('data-field-id', field.id);
                    var opts = field.options || [];
                    sel.innerHTML = '<option value="">Select...</option>';
                    opts.forEach(function(o) {
                        var opt = document.createElement('option');
                        opt.value = o;
                        opt.textContent = o;
                        if (o === value) opt.selected = true;
                        sel.appendChild(opt);
                    });
                    sel.addEventListener('change', function() {
                        state.form.customFields[field.id] = this.value;
                    });
                    section.appendChild(sel);
                } else if (type === 'number') {
                    var num = document.createElement('input');
                    num.type = 'number';
                    num.className = 'modora-input';
                    num.placeholder = field.placeholder || '';
                    num.value = value != null ? value : '';
                    num.setAttribute('data-field-id', field.id);
                    num.addEventListener('input', function() {
                        state.form.customFields[field.id] = this.value;
                    });
                    section.appendChild(num);
                } else if (type === 'screenshot') {
                    var screenshotWrap = document.createElement('div');
                    var screenshotBtn = document.createElement('button');
                    screenshotBtn.type = 'button';
                    screenshotBtn.className = 'modora-btn modora-btn-primary';
                    screenshotBtn.textContent = '📷 Take screenshot';
                    screenshotBtn.setAttribute('data-field-id', field.id);
                    var screenshotValue = state.form.customFields[field.id] || state.form.screenshotUrl;
                    if (screenshotValue) {
                        var preview = document.createElement('div');
                        preview.className = 'modora-screenshot-preview';
                        preview.textContent = 'Screenshot added';
                        screenshotWrap.appendChild(preview);
                    }
                    screenshotWrap.appendChild(screenshotBtn);
                    screenshotBtn.addEventListener('click', function() {
                        var btn = this;
                        btn.disabled = true;
                        btn.textContent = 'Taking screenshot...';
                        sendNuiCallback('requestScreenshotUpload', {}).then(function(data) {
                            btn.disabled = false;
                            btn.textContent = '📷 Take screenshot';
                            if (data && data.success && data.url) {
                                state.form.customFields[field.id] = data.url;
                                state.form.screenshotUrl = data.url;
                                state.form.evidenceUrls.push(data.url);
                                renderFormContent();
                                renderEvidenceUrls();
                            } else if (data && data.error) {
                                showFormError(data.error);
                            }
                        }).catch(function() {
                            btn.disabled = false;
                            btn.textContent = '📷 Take screenshot';
                        });
                    });
                    section.appendChild(screenshotWrap);
                } else if (type === 'file-upload') {
                    var fileNote = document.createElement('p');
                    fileNote.className = 'modora-card-subtitle';
                    fileNote.style.marginTop = '4px';
                    fileNote.textContent = 'You can add evidence URLs below.';
                    section.appendChild(fileNote);
                }

                var errField = document.createElement('div');
                errField.className = 'modora-error hidden';
                errField.setAttribute('data-field-error', field.id);
                section.appendChild(errField);
                wrapFields.appendChild(section);
            });
            container.appendChild(wrapFields);
        }

        // Subject (title)
        var sectionSub = document.createElement('div');
        sectionSub.className = 'modora-form-section';
        var labelSub = document.createElement('label');
        labelSub.className = 'modora-label';
        labelSub.setAttribute('for', 'subject');
        labelSub.textContent = 'Title';
        var inputSub = document.createElement('input');
        inputSub.type = 'text';
        inputSub.id = 'subject';
        inputSub.className = 'modora-input';
        inputSub.placeholder = 'Short title';
        inputSub.maxLength = 80;
        inputSub.value = state.form.subject || '';
        inputSub.addEventListener('input', function() {
            state.form.subject = this.value;
            var count = document.getElementById('subjectCount');
            if (count) count.textContent = this.value.length;
        });
        var subCount = document.createElement('div');
        subCount.id = 'subjectCount';
        subCount.className = 'modora-char-count';
        subCount.textContent = (state.form.subject || '').length;
        var errSub = document.createElement('div');
        errSub.id = 'subjectError';
        errSub.className = 'modora-error hidden';
        sectionSub.appendChild(labelSub);
        sectionSub.appendChild(inputSub);
        sectionSub.appendChild(subCount);
        sectionSub.appendChild(errSub);
        container.appendChild(sectionSub);

        // Description
        var sectionDesc = document.createElement('div');
        sectionDesc.className = 'modora-form-section';
        var labelDesc = document.createElement('label');
        labelDesc.className = 'modora-label';
        labelDesc.setAttribute('for', 'description');
        labelDesc.textContent = 'Description';
        var taDesc = document.createElement('textarea');
        taDesc.id = 'description';
        taDesc.className = 'modora-textarea';
        taDesc.placeholder = 'Describe what happened (min 20 characters)';
        taDesc.value = state.form.description || '';
        taDesc.addEventListener('input', function() {
            state.form.description = this.value;
            var count = document.getElementById('descriptionCount');
            if (count) count.textContent = this.value.length;
        });
        var descCount = document.createElement('div');
        descCount.id = 'descriptionCount';
        descCount.className = 'modora-char-count';
        descCount.textContent = (state.form.description || '').length;
        var errDesc = document.createElement('div');
        errDesc.id = 'descriptionError';
        errDesc.className = 'modora-error hidden';
        sectionDesc.appendChild(labelDesc);
        sectionDesc.appendChild(taDesc);
        sectionDesc.appendChild(descCount);
        sectionDesc.appendChild(errDesc);
        container.appendChild(sectionDesc);

        // Evidence URLs
        var sectionEv = document.createElement('div');
        sectionEv.className = 'modora-form-section';
        var labelEv = document.createElement('label');
        labelEv.className = 'modora-label';
        labelEv.textContent = 'Evidence (URLs)';
        sectionEv.appendChild(labelEv);
        var evidenceList = document.createElement('div');
        evidenceList.id = 'evidenceList';
        evidenceList.className = 'modora-evidence-list';
        sectionEv.appendChild(evidenceList);
        var btnAddEv = document.createElement('button');
        btnAddEv.type = 'button';
        btnAddEv.id = 'btnAddEvidence';
        btnAddEv.className = 'modora-btn modora-btn-ghost';
        btnAddEv.textContent = '+ Add URL';
        btnAddEv.addEventListener('click', addEvidenceUrl);
        sectionEv.appendChild(btnAddEv);
        container.appendChild(sectionEv);

        // Screenshot (if not already in dynamic fields)
        var hasScreenshotField = fields.some(function(f) { return (f.type || '').toLowerCase() === 'screenshot'; });
        if (!hasScreenshotField && rfc !== false) {
            var sectionSc = document.createElement('div');
            sectionSc.className = 'modora-form-section';
            var labelSc = document.createElement('label');
            labelSc.className = 'modora-label';
            labelSc.textContent = 'Screenshot';
            sectionSc.appendChild(labelSc);
            var screenshotBtn = document.createElement('button');
            screenshotBtn.type = 'button';
            screenshotBtn.id = 'btnTakeScreenshot';
            screenshotBtn.className = 'modora-btn modora-btn-primary';
            screenshotBtn.textContent = state.form.screenshotUrl ? 'Screenshot added' : '📷 Take screenshot';
            if (state.form.screenshotUrl) screenshotBtn.disabled = true;
            screenshotBtn.addEventListener('click', function() {
                var btn = this;
                btn.disabled = true;
                btn.textContent = 'Taking screenshot...';
                sendNuiCallback('requestScreenshotUpload', {}).then(function(data) {
                    btn.disabled = false;
                    btn.textContent = '📷 Take screenshot';
                    if (data && data.success && data.url) {
                        state.form.screenshotUrl = data.url;
                        state.form.evidenceUrls.push(data.url);
                        renderFormContent();
                        renderEvidenceUrls();
                    } else if (data && data.error) {
                        showFormError(data.error);
                    }
                }).catch(function() {
                    btn.disabled = false;
                    btn.textContent = '📷 Take screenshot';
                });
            });
            sectionSc.appendChild(screenshotBtn);
            container.appendChild(sectionSc);
        }

        // Nearby players
        var sectionNearby = document.createElement('div');
        sectionNearby.id = 'nearbySection';
        sectionNearby.className = 'modora-form-section';
        var labelNearby = document.createElement('label');
        labelNearby.className = 'modora-label';
        labelNearby.textContent = 'Nearby players (optional)';
        sectionNearby.appendChild(labelNearby);
        var nearbyDiv = document.createElement('div');
        nearbyDiv.id = 'nearbyPlayers';
        nearbyDiv.className = 'modora-nearby';
        sectionNearby.appendChild(nearbyDiv);
        container.appendChild(sectionNearby);

        renderEvidenceUrls();
        renderNearbyPlayers();
    }

    function showFormError(msg) {
        var formError = document.getElementById('formError');
        if (formError) {
            formError.textContent = msg;
            formError.classList.remove('hidden');
        }
    }

    function renderEvidenceUrls() {
        var list = document.getElementById('evidenceList');
        if (!list) return;
        list.innerHTML = '';
        state.form.evidenceUrls.forEach(function(url, i) {
            var item = document.createElement('div');
            item.className = 'modora-evidence-item';
            var input = document.createElement('input');
            input.type = 'url';
            input.placeholder = 'https://...';
            input.className = 'modora-input';
            input.value = url;
            input.setAttribute('data-index', i);
            input.addEventListener('input', function() {
                state.form.evidenceUrls[parseInt(this.getAttribute('data-index'), 10)] = this.value;
            });
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'modora-btn modora-btn-ghost';
            btn.textContent = 'Remove';
            btn.addEventListener('click', function() {
                state.form.evidenceUrls.splice(i, 1);
                renderFormContent();
            });
            item.appendChild(input);
            item.appendChild(btn);
            list.appendChild(item);
        });
    }

    function addEvidenceUrl() {
        state.form.evidenceUrls.push('');
        renderEvidenceUrls();
    }

    function renderNearbyPlayers() {
        var container = document.getElementById('nearbyPlayers');
        if (!container) return;
        var section = document.getElementById('nearbySection');
        var players = (state.playerData && state.playerData.nearbyPlayers) || [];
        if (players.length === 0) {
            if (section) section.classList.add('hidden');
            return;
        }
        if (section) section.classList.remove('hidden');
        container.innerHTML = '';
        state.form.targets = [];
        players.forEach(function(p) {
            var label = document.createElement('label');
            label.className = 'modora-player-option';
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = p.fivemId;
            cb.setAttribute('data-name', p.name || '');
            cb.addEventListener('change', function() {
                if (this.checked) {
                    state.form.targets.push({ fivemId: parseInt(this.value, 10), name: this.getAttribute('data-name') || '' });
                } else {
                    state.form.targets = state.form.targets.filter(function(t) { return t.fivemId !== parseInt(this.value, 10); });
                }
            });
            var span = document.createElement('span');
            span.textContent = (p.name || 'Player') + ' (ID: ' + p.fivemId + (p.distance != null ? ', ' + p.distance + 'm' : '') + ')';
            label.appendChild(cb);
            label.appendChild(span);
            container.appendChild(label);
        });
    }

    function validateForm() {
        var categoryEl = document.getElementById('category');
        var subjectEl = document.getElementById('subject');
        var descriptionEl = document.getElementById('description');

        var category = categoryEl ? categoryEl.value : '';
        var subject = (subjectEl && subjectEl.value) ? subjectEl.value.trim() : '';
        var description = (descriptionEl && descriptionEl.value) ? descriptionEl.value.trim() : '';

        var errors = {};
        if (!category) errors.category = 'Select a category';
        if (!subject || subject.length < 1) errors.subject = 'Title is required';
        else if (subject.length > 80) errors.subject = 'Title must be 80 characters or less';
        if (!description || description.length < 20) errors.description = 'Description must be at least 20 characters';
        else if (description.length > 2000) errors.description = 'Description must be 2000 characters or less';

        var selectedCat = getSelectedCategoryData();
        if (selectedCat && selectedCat.fields) {
            selectedCat.fields.forEach(function(field) {
                if (field.required) {
                    var val = state.form.customFields[field.id];
                    if (val === undefined || val === null || String(val).trim() === '') {
                        errors['field_' + field.id] = (field.label || field.id) + ' is required';
                    }
                }
            });
        }

        ['category', 'subject', 'description'].forEach(function(field) {
            var errEl = document.getElementById(field + 'Error');
            if (errEl) {
                errEl.textContent = errors[field] || '';
                errEl.classList.toggle('hidden', !errors[field]);
            }
        });
        var container = document.getElementById('formContent');
        if (container) {
            var fieldErrors = container.querySelectorAll('[data-field-error]');
            for (var i = 0; i < fieldErrors.length; i++) {
                var fid = fieldErrors[i].getAttribute('data-field-error');
                fieldErrors[i].textContent = errors['field_' + fid] || '';
                fieldErrors[i].classList.toggle('hidden', !errors['field_' + fid]);
            }
        }

        var formError = document.getElementById('formError');
        if (formError) {
            formError.textContent = Object.keys(errors).length ? (errors.category || errors.subject || errors.description || (selectedCat && selectedCat.fields && selectedCat.fields.find(function(f) { return errors['field_' + f.id]; }) && selectedCat.fields.map(function(f) { return errors['field_' + f.id]; }).filter(Boolean)[0]) || 'Please fix the errors above') : '';
            formError.classList.toggle('hidden', !formError.textContent);
        }
        return Object.keys(errors).length === 0;
    }

    function submitReport() {
        if (!state.playerData) return;
        if (!validateForm()) return;

        var categoryEl = document.getElementById('category');
        var subjectEl = document.getElementById('subject');
        var descriptionEl = document.getElementById('description');

        var subject = subjectEl ? subjectEl.value.trim() : '';
        var description = descriptionEl ? descriptionEl.value.trim() : '';
        var selectedCat = getSelectedCategoryData();
        if (selectedCat && selectedCat.fields) {
            var subjectField = selectedCat.fields.find(function(f) { return (f.type || '').toLowerCase() === 'text' && (f.label || '').toLowerCase().indexOf('subject') !== -1; });
            var descField = selectedCat.fields.find(function(f) { return (f.type || '').toLowerCase() === 'textarea' && (f.label || '').toLowerCase().indexOf('description') !== -1; });
            if (subjectField && state.form.customFields[subjectField.id]) subject = String(state.form.customFields[subjectField.id]);
            if (descField && state.form.customFields[descField.id]) description = String(state.form.customFields[descField.id]);
        }
        if (!subject) subject = 'Report';
        if (!description) description = '';

        var attachments = state.form.evidenceUrls.filter(Boolean).slice();
        if (state.form.screenshotUrl && attachments.indexOf(state.form.screenshotUrl) === -1) {
            attachments.push(state.form.screenshotUrl);
        }

        var reportData = {
            category: categoryEl ? categoryEl.value : '',
            subject: subject,
            description: description,
            priority: 'normal',
            reporter: {
                fivemId: state.playerData.fivemId,
                name: state.playerData.name,
                identifiers: state.playerData.identifiers || {},
                position: state.playerData.position || null
            },
            targets: state.form.targets,
            attachments: attachments,
            customFields: state.form.customFields || {},
            evidenceUrls: state.form.evidenceUrls.filter(Boolean)
        };

        showView('submitting');

        sendNuiCallback('submitReport', reportData).then(function(data) {
            if (data && data.success) {
                // Wait for reportSubmitted event from Lua for final result
            } else {
                showView('form');
                showFormError((data && data.error) || 'Submit failed');
                var btn = document.getElementById('btnSubmit');
                if (btn) btn.disabled = false;
            }
        }).catch(function(err) {
            showView('form');
            showFormError('Failed to send report. Try again.');
            var btn = document.getElementById('btnSubmit');
            if (btn) btn.disabled = false;
        });
    }

    function handleReportSubmitted(payload) {
        var success = payload && payload.success;
        var ticketNumber = payload && payload.ticketNumber;
        var ticketId = payload && payload.ticketId;
        var ticketUrl = payload && payload.ticketUrl;
        var error = payload && payload.error;
        var cooldownSeconds = payload && payload.cooldownSeconds;

        var btn = document.getElementById('btnSubmit');
        if (btn) btn.disabled = false;

        if (success) {
            state.lastSuccess = { ticketId: ticketId, ticketNumber: ticketNumber, ticketUrl: ticketUrl };
            var msg = document.getElementById('successMessage');
            if (msg) {
                msg.textContent = ticketNumber != null
                    ? 'Your report was submitted. Ticket #' + escapeText(String(ticketNumber))
                    : 'Your report was submitted successfully.';
            }
            showView('success');
        } else {
            showView('form');
            showFormError(escapeText(error || 'Report could not be sent.'));
            if (cooldownSeconds != null && cooldownSeconds > 0) {
                state.cooldownRemaining = cooldownSeconds;
                var notice = document.getElementById('cooldownNotice');
                if (notice) {
                    notice.textContent = 'You can report again in ' + cooldownSeconds + ' seconds.';
                    notice.classList.remove('hidden');
                }
            }
        }
    }

    function openReport() {
        showView('loading');
        state.form = {
            category: '',
            subject: '',
            description: '',
            evidenceUrls: [],
            targets: [],
            customFields: {},
            screenshotUrl: null
        };
        state.lastSuccess = null;

        var serverNameEl = document.getElementById('serverName');
        if (serverNameEl && state.init && state.init.serverName) {
            serverNameEl.textContent = escapeText(state.init.serverName);
        } else if (serverNameEl) {
            serverNameEl.textContent = '';
        }

        Promise.all([requestPlayerData(), requestServerConfig()]).then(function() {
            renderIntroText();
            renderFormContent();
            var formError = document.getElementById('formError');
            var cooldownNotice = document.getElementById('cooldownNotice');
            if (formError) { formError.classList.add('hidden'); formError.textContent = ''; }
            if (cooldownNotice) cooldownNotice.classList.add('hidden');
            showView('form');
        }).catch(function() {
            showFormError('Could not load form. Try again.');
            renderFormContent();
            showView('form');
        });
    }

    function renderIntroText() {
        var rfc = state.serverConfig && state.serverConfig.reportFormConfig;
        var intro = (rfc && rfc.introText) ? String(rfc.introText).trim() : '';
        var el = document.getElementById('reportIntroText');
        if (!el) return;
        if (intro) {
            el.textContent = intro;
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    }

    function closeReport() {
        showView('closed');
        sendNuiCallback('closeReport', {}).catch(function() {});
    }

    function bindUi() {
        var app = document.getElementById('app');
        var backdrop = app && app.querySelector('[data-action="close"]');
        if (backdrop) backdrop.addEventListener('click', closeReport);

        var btnClose = document.getElementById('btnClose');
        if (btnClose) btnClose.addEventListener('click', closeReport);

        var btnCancel = document.getElementById('btnCancel');
        if (btnCancel) btnCancel.addEventListener('click', closeReport);

        var btnCloseSuccess = document.getElementById('btnCloseSuccess');
        if (btnCloseSuccess) btnCloseSuccess.addEventListener('click', closeReport);

        var form = document.getElementById('reportForm');
        if (form) {
            form.addEventListener('submit', function(e) {
                e.preventDefault();
                submitReport();
            });
        }
    }

    window.addEventListener('message', function(event) {
        var data = event.data;
        if (data.type === 'INIT') {
            state.init = {
                serverName: data.serverName,
                cooldownRemaining: data.cooldownRemaining,
                playerName: data.playerName,
                theme: data.theme,
                version: data.version
            };
        }
        if (data.action === 'openReport') {
            if (data.type === 'INIT') {
                state.init = state.init || {};
                state.init.serverName = data.serverName || state.init.serverName;
                state.init.cooldownRemaining = data.cooldownRemaining != null ? data.cooldownRemaining : state.init.cooldownRemaining;
                state.init.playerName = data.playerName || state.init.playerName;
            }
            openReport();
        } else if (data.action === 'closeReport') {
            closeReport();
        } else if (data.action === 'reportSubmitted') {
            handleReportSubmitted(data);
        } else if (data.action === 'screenshotReady' && data.url) {
            state.form.evidenceUrls.push(data.url);
            state.form.screenshotUrl = data.url;
            renderFormContent();
            renderEvidenceUrls();
        }
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && state.view !== 'closed') {
            closeReport();
        }
    });

    document.addEventListener('DOMContentLoaded', bindUi);
})();
