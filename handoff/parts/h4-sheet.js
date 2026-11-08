/* H4 Send a task sheet. Crew part (handoff-js-part, DeepSeek V4 Pro) with Claude's fixes: the WhatsApp label,
   the reader read fresh at Send, labels beside their controls, the client list filled on open. */
(function () {
  'use strict';

  const DEBOUNCE_MS = 250;
  const MAX_TITLE_LEN = 300;
  const MAX_NOTE_LEN = 2000;
  const MAX_REPLY_LEN = 1000;

  let deps = null;
  let root = null;
  let overlay = null;
  let closeBtn = null;
  let textarea = null;
  let peopleDiv = null;
  let dueInput = null;
  let clientSelect = null;
  let noteInput = null;
  let readPara = null;
  let errPara = null;
  let barDiv = null;
  let bodyDiv = null;
  let titleEl = null;

  let picked = new Set();
  let handChanged = { people: false, due: false, client: false };
  let debounceTimer = null;
  let lastReadResult = null;

  function capitalise(name) {
    if (!name) return '';
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }

  function formatDate(ymd) {
    if (!ymd) return '';
    const d = new Date(ymd + 'T00:00:00Z');
    if (isNaN(d)) return '';
    /* Claude fix: Chrome's en-GB puts a comma after the weekday; the house date is 'Fri 13 Nov' */
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] + ' ' + d.getUTCDate() + ' '
      + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  }

  function buildChips() {
    peopleDiv.innerHTML = '';
    const people = deps.people();
    for (const p of people) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ho-chip';
      btn.setAttribute('aria-pressed', picked.has(p.id) ? 'true' : 'false');
      btn.textContent = capitalise(p.name);
      btn.addEventListener('click', () => {
        if (picked.has(p.id)) {
          picked.delete(p.id);
        } else {
          picked.add(p.id);
        }
        handChanged.people = true;
        refreshChipsAndBar();
      });
      peopleDiv.appendChild(btn);

      if (p.phones === 0) {
        const note = document.createElement('span');
        note.className = 'ho-chip-note';
        note.textContent = 'No phone alerts';
        btn.appendChild(note);
      }
    }
  }

  function refreshChipsAndBar() {
    const people = deps.people();
    const buttons = peopleDiv.querySelectorAll('.ho-chip');
    buttons.forEach((btn, idx) => {
      const p = people[idx];
      btn.setAttribute('aria-pressed', picked.has(p.id) ? 'true' : 'false');
    });
    renderBar();
  }

  function anyPickedHasNoPhone() {
    const people = deps.people();
    for (const p of people) {
      if (picked.has(p.id) && p.phones === 0) return true;
    }
    return false;
  }

  function pickedCount() {
    return picked.size;
  }

  function pickedNames() {
    const people = deps.people();
    const names = [];
    for (const p of people) {
      if (picked.has(p.id)) names.push(capitalise(p.name));
    }
    return names;
  }

  function pickedPeople() {
    const people = deps.people();
    return people.filter(p => picked.has(p.id));
  }

  function renderBar() {
    barDiv.innerHTML = '';
    const count = pickedCount();
    const hasNoPhone = anyPickedHasNoPhone();
    const names = pickedNames();

    let mainLabel = 'Pick who it is for';
    let mainDisabled = true;
    if (count === 1) {
      mainLabel = 'Send to ' + names[0];
      mainDisabled = false;
    } else if (count > 1) {
      mainLabel = 'Send as ' + count + ' tasks';
      mainDisabled = false;
    }
    if (count > 0 && hasNoPhone) mainLabel = 'Send, then WhatsApp them';

    const mainBtn = document.createElement('button');
    mainBtn.className = 'btn-primary ho-main';
    mainBtn.textContent = mainLabel;
    mainBtn.disabled = mainDisabled;
    mainBtn.addEventListener('click', () => doSend(true));
    barDiv.appendChild(mainBtn);

    if (hasNoPhone && count > 0) {
      const wideBtn = document.createElement('button');
      wideBtn.className = 'btn-ghost ho-wide';
      wideBtn.textContent = 'Send without WhatsApp';
      wideBtn.addEventListener('click', () => doSend(false));
      barDiv.appendChild(wideBtn);
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-ghost ho-wide ho-quiet';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closeSheet);
    barDiv.appendChild(cancelBtn);
  }

  function setButtonsDisabled(disabled) {
    const buttons = barDiv.querySelectorAll('button');
    buttons.forEach(b => { b.disabled = disabled; });
  }

  function showError(msg) {
    errPara.textContent = msg;
    errPara.hidden = false;
  }

  function clearError() {
    errPara.textContent = '';
    errPara.hidden = true;
  }

  function closeSheet() {
    overlay.classList.add('hidden');
  }

  function resetSheet() {
    textarea.value = '';
    dueInput.value = '';
    clientSelect.value = '';
    noteInput.value = '';
    picked.clear();
    handChanged = { people: false, due: false, client: false };
    lastReadResult = null;
    readPara.textContent = '';
    clearError();
    buildChips();
    renderBar();
    bodyDiv.innerHTML = '';
    bodyDiv.appendChild(textarea.parentNode);
    bodyDiv.appendChild(peopleDiv.parentNode);
    bodyDiv.appendChild(dueInput.parentNode);
    bodyDiv.appendChild(clientSelect.parentNode);
    bodyDiv.appendChild(noteInput.parentNode);
    bodyDiv.appendChild(readPara);
    bodyDiv.appendChild(errPara);
  }

  function fillClients() {
    while (clientSelect.options.length > 1) clientSelect.remove(1);
    for (const c of deps.clients()) {
      const o = document.createElement('option');
      o.value = String(c.id);
      o.textContent = c.name;
      clientSelect.appendChild(o);
    }
  }

  function openSheet(prefill) {
    fillClients();
    resetSheet();
    if (prefill) {
      if (prefill.text) {
        textarea.value = prefill.text;
        runReader();
      }
      if (prefill.clientId !== undefined && prefill.clientId !== null) {
        clientSelect.value = String(prefill.clientId);
        handChanged.client = true;
      }
      if (prefill.due) {
        dueInput.value = prefill.due;
        handChanged.due = true;
      }
      if (prefill.people && prefill.people.length) {
        picked = new Set(prefill.people);
        handChanged.people = true;
        refreshChipsAndBar();
      }
    }
    overlay.classList.remove('hidden');
    textarea.focus();
  }

  function runReader() {
    const text = textarea.value.trim();
    if (!text) {
      if (!handChanged.people && !handChanged.due && !handChanged.client) {
        readPara.textContent = '';
        lastReadResult = null;
      }
      return;
    }
    Promise.resolve(readNow(text))
      .then(result => {
        if (!result) return;
        lastReadResult = result;
        const parts = [];
        if (result.people && result.people.length) {
          const names = result.people.map(id => {
            const p = deps.people().find(x => x.id === id);
            return p ? capitalise(p.name) : '';
          }).filter(Boolean);
          if (names.length) parts.push(names.join(' and '));
          if (!handChanged.people) {
            picked = new Set(result.people);
            refreshChipsAndBar();
          }
        }
        if (result.due && !handChanged.due) {
          dueInput.value = result.due;
          parts.push(formatDate(result.due));
        }
        if (result.client && !handChanged.client) {
          clientSelect.value = String(result.client);
          const c = deps.clients().find(x => x.id === result.client);
          if (c) parts.push(c.name);
        }
        readPara.textContent = parts.length ? 'Read: ' + parts.join(', ') : '';
      })
      .catch(() => {
        readPara.textContent = '';
      });
  }

  function readNow(text) {
    try { return deps.read(text, { people: deps.people(), clients: deps.clients(), today: deps.today() }); }
    catch (e) { return null; }
  }

  function doSend(whatsapp) {
    clearError();
    const text = textarea.value.trim();
    if (!text) {
      showError('Say what needs doing first.');
      return;
    }
    const fresh = readNow(text);
    if (fresh && typeof fresh.then !== 'function') lastReadResult = fresh;
    const titleRaw = (lastReadResult && lastReadResult.title) ? lastReadResult.title : text;
    const title = titleRaw.substring(0, MAX_TITLE_LEN);
    const due = dueInput.value || null;
    const clientId = clientSelect.value ? Number(clientSelect.value) : null;
    const note = noteInput.value.trim() || null;
    const by = deps.me();
    const targets = pickedPeople();
    if (!targets.length) {
      showError('Pick who it is for first.');
      return;
    }

    setButtonsDisabled(true);
    const failed = [];
    const succeeded = [];
    let promiseChain = Promise.resolve();
    for (const p of targets) {
      promiseChain = promiseChain.then(() => {
        return deps.rpc('bb_handoff_send', {
          p_to_id: p.id,
          p_title: title,
          p_due: due,
          p_client_id: clientId,
          p_note: note,
          p_by: by
        }).then(id => {
          succeeded.push(p);
        }).catch(err => {
          failed.push({ person: p, error: err });
        });
      });
    }

    promiseChain.then(() => {
      setButtonsDisabled(false);
      if (failed.length === 0) {
        const names = succeeded.map(p => capitalise(p.name));
        const toastMsg = succeeded.length === 1 ? 'Sent to ' + names[0] : 'Sent as ' + succeeded.length + ' tasks';
        deps.toast(toastMsg);
        deps.onSent();

        if (whatsapp && anyPickedHasNoPhoneInList(succeeded)) {
          showDoneState(succeeded);
        } else {
          closeSheet();
        }
      } else {
        const failedNames = failed.map(f => capitalise(f.person.name));
        const succeededIds = new Set(succeeded.map(p => p.id));
        picked = new Set(failed.map(f => f.person.id));
        handChanged.people = true;
        refreshChipsAndBar();
        const errMessages = failed.map(f => {
          const code = f.error.message.split(':')[0].trim();
          let plain = f.error.message;
          if (code === 'HO_CAP') plain = 'Today\'s limit of 200 sent tasks is reached.';
          else if (code === 'HO_NOT_YOURS') plain = 'This task is not yours to change.';
          else if (code === 'HO_STATE') plain = 'This task has already moved on. Refresh to see it.';
          else if (code === 'HO_NOT_FOUND') plain = 'This task is no longer there.';
          else if (code === 'HO_BAD_INPUT') plain = f.error.message.substring(f.error.message.indexOf(':') + 1).trim();
          else plain = 'That did not go through. Check the connection and try again.';
          return capitalise(f.person.name) + ': ' + plain;
        });
        showError('Not sent to ' + failedNames.join(', ') + '. ' + errMessages.join(' ') + ' Press Send again for the rest.');
      }
    });
  }

  function anyPickedHasNoPhoneInList(list) {
    for (const p of list) {
      if (p.phones === 0) return true;
    }
    return false;
  }

  function showDoneState(succeeded) {
    bodyDiv.innerHTML = '';
    const msg = document.createElement('p');
    msg.className = 'ho-read';
    msg.textContent = 'Saved. Now tell them on WhatsApp.';
    bodyDiv.appendChild(msg);
    bodyDiv.appendChild(errPara);

    barDiv.innerHTML = '';
    const noPhonePeople = succeeded.filter(p => p.phones === 0);
    const title = (lastReadResult && lastReadResult.title) ? lastReadResult.title : textarea.value.trim();
    const client = clientSelect.value ? deps.clients().find(c => c.id === Number(clientSelect.value)) : null;
    const due = dueInput.value;

    for (let i = 0; i < noPhonePeople.length; i++) {
      const p = noPhonePeople[i];
      const name = capitalise(p.name);
      let message = name + ', a task from ' + capitalise(deps.me()) + ': ' + title;
      if (client) message += ' (' + client.name + ')';
      if (due) message += ', by ' + formatDate(due);
      message += '.';
      const a = document.createElement('a');
      a.className = 'btn-primary ho-wa';
      a.textContent = 'WhatsApp ' + name;
      a.href = 'https://wa.me/?text=' + encodeURIComponent(message);
      a.target = '_blank';
      a.rel = 'noopener';
      barDiv.appendChild(a);
    }

    const closeBtn2 = document.createElement('button');
    closeBtn2.className = 'btn-ghost ho-wide ho-quiet';
    closeBtn2.textContent = 'Close';
    closeBtn2.addEventListener('click', closeSheet);
    barDiv.appendChild(closeBtn2);
  }

  function stuck(mount, rows) {
    mount.innerHTML = '';
    for (const row of rows) {
      const div = document.createElement('div');
      div.className = 'ho-stuck';

      const titleDiv = document.createElement('div');
      titleDiv.className = 'ho-st-title';
      titleDiv.textContent = row.title;
      div.appendChild(titleDiv);

      const whoDiv = document.createElement('div');
      whoDiv.className = 'ho-st-who';
      whoDiv.textContent = capitalise(row.sent_to_name) + ' is stuck';
      div.appendChild(whoDiv);

      const lines = row.stuck_note ? row.stuck_note.split('\n') : [];
      for (const line of lines) {
        const lineDiv = document.createElement('div');
        lineDiv.className = 'ho-st-line';
        lineDiv.textContent = line;
        div.appendChild(lineDiv);
      }

      if (row.stuck_reply && row.stuck_reply_at && row.stuck_at && row.stuck_reply_at >= row.stuck_at) {
        const replyDiv = document.createElement('div');
        replyDiv.className = 'ho-st-reply';
        replyDiv.textContent = 'You replied: ' + row.stuck_reply;
        div.appendChild(replyDiv);
      }

      const input = document.createElement('input');
      input.className = 'form-input ho-in ho-st-in';
      input.placeholder = 'Reply in one line';
      input.maxLength = MAX_REPLY_LEN;
      div.appendChild(input);

      const errP = document.createElement('p');
      errP.className = 'ho-err';
      errP.hidden = true;
      errP.setAttribute('role', 'alert');
      div.appendChild(errP);

      const pairDiv = document.createElement('div');
      pairDiv.className = 'ho-pair';

      const sendBtn = document.createElement('button');
      sendBtn.className = 'btn-primary';
      sendBtn.textContent = 'Send reply';
      sendBtn.addEventListener('click', () => {
        const reply = input.value.trim();
        if (!reply) {
          errP.textContent = 'Type a reply first.';
          errP.hidden = false;
          return;
        }
        errP.hidden = true;
        sendBtn.disabled = true;
        deps.rpc('bb_handoff_reply', { p_id: row.id, p_by: deps.me(), p_reply: reply })
          .then(() => {
            deps.toast('Reply sent to ' + capitalise(row.sent_to_name));
            deps.onSent();
          })
          .catch(err => {
            const code = err.message.split(':')[0].trim();
            let plain = err.message;
            if (code === 'HO_NOT_YOURS') plain = 'This task is not yours to change.';
            else if (code === 'HO_STATE') plain = 'This task has already moved on. Refresh to see it.';
            else if (code === 'HO_NOT_FOUND') plain = 'This task is no longer there.';
            else if (code === 'HO_BAD_INPUT') plain = err.message.substring(err.message.indexOf(':') + 1).trim();
            else plain = 'That did not go through. Check the connection and try again.';
            errP.textContent = plain;
            errP.hidden = false;
            sendBtn.disabled = false;
          });
      });
      pairDiv.appendChild(sendBtn);

      const fwdBtn = document.createElement('button');
      fwdBtn.className = 'btn-ghost';
      fwdBtn.textContent = 'Forward';
      fwdBtn.addEventListener('click', () => {
        const lastLine = lines[lines.length - 1] || '';
        const text = lastLine.replace(/^\d{2}\s\w{3}\s\d{2}:\d{2}\s/, '');
        openSheet({ text: text, clientId: row.client_id });
      });
      pairDiv.appendChild(fwdBtn);

      div.appendChild(pairDiv);
      mount.appendChild(div);
    }
  }

  window.hoSheet = {
    init(d) {
      deps = d;
      root = document.createElement('div');
      root.id = 'ho-sheet';
      root.className = 'modal-overlay hidden';
      root.innerHTML = `
        <div class="modal ho-sheet" role="dialog" aria-modal="true" aria-labelledby="ho-sh-title">
          <div class="modal-head">
            <div class="modal-title" id="ho-sh-title">Send a task</div>
            <button type="button" class="modal-close" aria-label="Close">×</button>
          </div>
          <div class="modal-body"></div>
          <div class="modal-foot ho-bar"></div>
        </div>
      `;
      document.body.appendChild(root);

      overlay = root;
      closeBtn = root.querySelector('.modal-close');
      bodyDiv = root.querySelector('.modal-body');
      barDiv = root.querySelector('.ho-bar');
      titleEl = root.querySelector('#ho-sh-title');

      closeBtn.addEventListener('click', closeSheet);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeSheet();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeSheet();
      });

      // Build fields: each a div.form-field holding its label then its control (Claude: a label wrapping
      // the chips made a tap on the word Who press the first chip)
      const field = (labelText, control, isGroup) => {
        const wrap = document.createElement('div');
        wrap.className = 'form-field ho-field';
        const lab = document.createElement(isGroup ? 'div' : 'label');
        lab.className = 'form-label';
        lab.textContent = labelText;
        if (isGroup) { wrap.setAttribute('role', 'group'); lab.id = 'ho-who-label'; wrap.setAttribute('aria-labelledby', 'ho-who-label'); }
        else if (control.id) lab.htmlFor = control.id;
        wrap.appendChild(lab);
        wrap.appendChild(control);
        return wrap;
      };
      textarea = document.createElement('textarea');
      textarea.id = 'ho-text';
      textarea.className = 'form-textarea ho-in';
      textarea.rows = 3;
      textarea.placeholder = 'Ushane, cut the Sastho reel by Friday';

      peopleDiv = document.createElement('div');
      peopleDiv.className = 'ho-people';

      dueInput = document.createElement('input');
      dueInput.id = 'ho-due';
      dueInput.type = 'date';
      dueInput.className = 'form-input ho-in';

      clientSelect = document.createElement('select');
      clientSelect.id = 'ho-client';
      clientSelect.className = 'form-select ho-in';
      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = 'No client';
      clientSelect.appendChild(emptyOpt);

      noteInput = document.createElement('input');
      noteInput.id = 'ho-note';
      noteInput.className = 'form-input ho-in';
      noteInput.maxLength = MAX_NOTE_LEN;

      readPara = document.createElement('p');
      readPara.className = 'ho-read';
      readPara.setAttribute('aria-live', 'polite');

      errPara = document.createElement('p');
      errPara.className = 'ho-err';
      errPara.setAttribute('role', 'alert');
      errPara.hidden = true;

      bodyDiv.appendChild(field('What needs doing', textarea));
      bodyDiv.appendChild(field('Who', peopleDiv, true));
      bodyDiv.appendChild(field('Day', dueInput));
      bodyDiv.appendChild(field('Client', clientSelect));
      bodyDiv.appendChild(field('Note (optional)', noteInput));
      bodyDiv.appendChild(readPara);
      bodyDiv.appendChild(errPara);

      textarea.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(runReader, DEBOUNCE_MS);
      });

      dueInput.addEventListener('change', () => { handChanged.due = true; });
      clientSelect.addEventListener('change', () => { handChanged.client = true; });

      buildChips();
      renderBar();
    },
    open: openSheet,
    stuck: stuck
  };
})();
