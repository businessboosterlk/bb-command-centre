/* H5 From Thulaib card. Crew part (handoff-js-part, DeepSeek V4 Pro) with Claude's fixes: rows found by data-id
   (nth-child counted the title and the line above), the error codes read anywhere in the message, no 60 s
   repaint while a Done or Stuck line is being typed. */
const hoCard = (function() {
  function capitalise(s) {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }

  function formatDate(yyyymmdd) {
    if (!yyyymmdd) return '';
    const d = new Date(yyyymmdd + 'T00:00:00Z');
    if (isNaN(d)) return '';
    /* Claude fix: Chrome's en-GB puts a comma after the weekday; the house date is 'Fri 13 Nov' */
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] + ' ' + d.getUTCDate() + ' '
      + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  }

  function senderName(row) {
    return capitalise(row.sent_by);
  }

  function isLate(row, today) {
    return row.due && row.due < today;
  }

  function isStuck(row) {
    return !!row.stuck_at;
  }

  function hasReply(row) {
    return row.stuck_reply && row.stuck_reply_at && row.stuck_reply_at >= row.stuck_at;
  }

  function isDone(row) {
    return row.done;
  }

  function isOpen(row) {
    return !row.done;
  }

  return function hoCard(mount, deps) {
    const me = deps.me();
    const myId = deps.myId();
    const today = deps.today();
    let rows = [];
    let seenSet = new Set();
    let reloadTimer = null;
    let reloading = false;
    let openFormRowId = null;
    let openFormType = null;

    function stopTimer() {
      if (reloadTimer) {
        clearInterval(reloadTimer);
        reloadTimer = null;
      }
    }

    function startTimer() {
      stopTimer();
      if (document.visibilityState === 'visible') {
        reloadTimer = setInterval(() => {
          if (document.visibilityState === 'visible') {
            reload();
          }
        }, 60000);
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        reload();
        startTimer();
      } else {
        stopTimer();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    async function reload(force) {
      if (reloading) return;
      if (openFormRowId !== null && force !== true) return;
      reloading = true;
      try {
        const path = `tasks?select=id,title,due,client_id,notes,sent_by,seen_at,stuck_note,stuck_at,stuck_reply,stuck_reply_at,done,done_note,completed_at,created_at&sent_to_id=eq.${myId}&cancelled_at=is.null&or=(done.is.false,completed_at.gte.${today}T00:00:00%2B05:30)&order=created_at.asc`;
        const data = await deps.get(path);
        if (!data || data.length === 0) {
          mount.innerHTML = '';
          mount.hidden = true;
          rows = [];
          return;
        }
        mount.hidden = false;
        rows = data;

        // Mark unseen rows as seen
        for (const row of rows) {
          if (row.seen_at === null && !row.done && !seenSet.has(row.id)) {
            seenSet.add(row.id);
            deps.rpc('bb_handoff_seen', { p_id: row.id, p_who: me, p_carry_on: false }).catch(() => {});
          }
        }

        paint();
      } catch (e) {
        // Silently fail reload
      } finally {
        reloading = false;
      }
    }

    function paint() {
      mount.innerHTML = '';
      const section = document.createElement('section');
      section.className = 'ho-card';

      const senders = new Set(rows.map(r => r.sent_by));
      let titleText = '';
      if (senders.size === 1) {
        titleText = `From ${capitalise([...senders][0])}`;
      } else if (senders.size === 2) {
        titleText = `From ${capitalise([...senders][0])} and ${capitalise([...senders][1])}`;
      } else {
        titleText = 'From Thulaib and Shiara';
      }

      const h2 = document.createElement('h2');
      h2.className = 'ho-card-title';
      h2.textContent = titleText;
      section.appendChild(h2);

      const openCount = rows.filter(r => isOpen(r)).length;
      const sub = document.createElement('p');
      sub.className = 'ho-card-sub';
      if (openCount === 0) {
        sub.textContent = 'All done for today';
      } else if (openCount === 1) {
        sub.textContent = '1 to do';
      } else {
        sub.textContent = `${openCount} to do`;
      }
      section.appendChild(sub);

      const openRows = rows.filter(r => isOpen(r));
      const doneRows = rows.filter(r => isDone(r));
      const sortedRows = [...openRows, ...doneRows];

      for (const row of sortedRows) {
        const taskDiv = document.createElement('div');
        taskDiv.className = 'ho-task';
        taskDiv.dataset.id = String(row.id);
        if (isDone(row)) {
          taskDiv.classList.add('ho-done');
        }

        const titleDiv = document.createElement('div');
        titleDiv.className = 'ho-t-title';
        titleDiv.textContent = row.title;
        taskDiv.appendChild(titleDiv);

        if (isOpen(row)) {
          const metaParts = [];
          if (senders.size > 1) {
            metaParts.push(`From ${senderName(row)}`);
          }
          if (row.client_id) {
            const clientName = deps.clientName(row.client_id);
            if (clientName) metaParts.push(clientName);
          }
          if (row.due) {
            if (isLate(row, today)) {
              const span = document.createElement('span');
              span.className = 'ho-late';
              span.textContent = `was due ${formatDate(row.due)}`;
              const metaDiv = document.createElement('div');
              metaDiv.className = 'ho-t-meta';
              if (metaParts.length) {
                metaDiv.textContent = metaParts.join(' · ') + ' · ';
                metaDiv.appendChild(span);
              } else {
                metaDiv.appendChild(span);
              }
              taskDiv.appendChild(metaDiv);
            } else {
              metaParts.push(`by ${formatDate(row.due)}`);
            }
          }
          if (metaParts.length && (!row.due || !isLate(row, today))) {
            const metaDiv = document.createElement('div');
            metaDiv.className = 'ho-t-meta';
            metaDiv.textContent = metaParts.join(' · ');
            taskDiv.appendChild(metaDiv);
          }

          if (row.notes) {
            const noteDiv = document.createElement('div');
            noteDiv.className = 'ho-t-note';
            noteDiv.textContent = row.notes;
            taskDiv.appendChild(noteDiv);
          }

          if (isStuck(row)) {
            const stuckDiv = document.createElement('div');
            stuckDiv.className = 'ho-t-stuck';
            const lines = row.stuck_note.split('\n');
            lines.forEach((line, i) => {
              const p = document.createElement('p');
              p.textContent = (i === 0 ? 'You said: ' : '') + line;
              stuckDiv.appendChild(p);
            });
            taskDiv.appendChild(stuckDiv);

            if (hasReply(row)) {
              const replyDiv = document.createElement('div');
              replyDiv.className = 'ho-t-reply';
              replyDiv.textContent = `${senderName(row)}: ${row.stuck_reply}`;
              taskDiv.appendChild(replyDiv);

              const carryBtn = document.createElement('button');
              carryBtn.className = 'btn-primary ho-wide';
              carryBtn.textContent = 'Carry on';
              carryBtn.style.touchAction = 'manipulation';
              carryBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                carryBtn.disabled = true;
                try {
                  await deps.rpc('bb_handoff_seen', { p_id: row.id, p_who: me, p_carry_on: true });
                  deps.toast('Back on it');
                  await reload();
                } catch (err) {
                  showError(taskDiv, err.message);
                } finally {
                  carryBtn.disabled = false;
                }
              });
              taskDiv.appendChild(carryBtn);
            }

            const pairDiv = document.createElement('div');
            pairDiv.className = 'ho-pair';

            const doneBtn = document.createElement('button');
            /* Claude fix: once Carry on is the primary, Done steps back so the row has one primary */
            doneBtn.className = hasReply(row) ? 'btn-ghost' : 'btn-primary';
            doneBtn.textContent = 'Done';
            doneBtn.style.touchAction = 'manipulation';
            doneBtn.addEventListener('click', (e) => {
              e.preventDefault();
              openForm(row.id, 'done');
            });
            pairDiv.appendChild(doneBtn);

            const stuckBtn = document.createElement('button');
            stuckBtn.className = 'btn-ghost';
            stuckBtn.textContent = 'Stuck';
            stuckBtn.style.touchAction = 'manipulation';
            stuckBtn.addEventListener('click', (e) => {
              e.preventDefault();
              openForm(row.id, 'stuck');
            });
            pairDiv.appendChild(stuckBtn);

            taskDiv.appendChild(pairDiv);
          } else {
            const pairDiv = document.createElement('div');
            pairDiv.className = 'ho-pair';

            const doneBtn = document.createElement('button');
            doneBtn.className = 'btn-primary';
            doneBtn.textContent = 'Done';
            doneBtn.style.touchAction = 'manipulation';
            doneBtn.addEventListener('click', (e) => {
              e.preventDefault();
              openForm(row.id, 'done');
            });
            pairDiv.appendChild(doneBtn);

            const stuckBtn = document.createElement('button');
            stuckBtn.className = 'btn-ghost';
            stuckBtn.textContent = 'Stuck';
            stuckBtn.style.touchAction = 'manipulation';
            stuckBtn.addEventListener('click', (e) => {
              e.preventDefault();
              openForm(row.id, 'stuck');
            });
            pairDiv.appendChild(stuckBtn);

            taskDiv.appendChild(pairDiv);
          }

          // Form container
          const formContainer = document.createElement('div');
          formContainer.className = 'ho-t-form';
          formContainer.style.display = 'none';
          taskDiv.appendChild(formContainer);

        } else {
          // Done row
          const metaDiv = document.createElement('div');
          metaDiv.className = 'ho-t-meta';
          let metaText = 'Done';
          if (row.done_note) {
            metaText += ' · ' + row.done_note;
          }
          metaDiv.textContent = metaText;
          taskDiv.appendChild(metaDiv);
        }

        section.appendChild(taskDiv);
      }

      mount.appendChild(section);
    }

    function openForm(rowId, type) {
      // Same row and same button: leave it open. Same row, other button: swap the form.
      if (openFormRowId === rowId && openFormType === type) return;
      closeForm();
      openFormRowId = rowId;
      openFormType = type;

      const taskDiv = taskEl(rowId);
      if (!taskDiv) return;
      const formContainer = taskDiv.querySelector('.ho-t-form');
      if (!formContainer) return;
      formContainer.innerHTML = '';
      formContainer.style.display = 'flex';

      const input = document.createElement('input');
      input.className = 'form-input ho-in';
      input.style.fontSize = '16px';
      input.maxLength = 1000;
      if (type === 'done') {
        input.placeholder = 'What I did (optional)';
      } else {
        input.placeholder = 'What is in the way';
        input.required = true;
      }
      formContainer.appendChild(input);

      const errP = document.createElement('p');
      errP.className = 'ho-err';
      errP.style.display = 'none';
      formContainer.appendChild(errP);

      const pairDiv = document.createElement('div');
      pairDiv.className = 'ho-pair';

      const submitBtn = document.createElement('button');
      submitBtn.className = 'btn-primary';
      submitBtn.textContent = type === 'done' ? 'Mark done' : 'Send';
      submitBtn.style.touchAction = 'manipulation';
      submitBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const value = input.value.trim();
        if (type === 'stuck' && !value) {
          errP.textContent = 'Say what is in the way first.';
          errP.style.display = 'block';
          return;
        }
        errP.style.display = 'none';
        submitBtn.disabled = true;
        try {
          if (type === 'done') {
            await deps.rpc('bb_handoff_done', { p_id: rowId, p_who: me, p_note: value || null });
            const row = rows.find(r => r.id === rowId);
            deps.toast(`Done. ${senderName(row)} can see it`);
          } else {
            await deps.rpc('bb_handoff_stuck', { p_id: rowId, p_who: me, p_note: value });
            const row = rows.find(r => r.id === rowId);
            deps.toast(`Sent to ${senderName(row)}`);
          }
          closeForm();
          await reload(true);
        } catch (err) {
          showError(taskDiv, err.message);
        } finally {
          submitBtn.disabled = false;
        }
      });
      pairDiv.appendChild(submitBtn);

      const backBtn = document.createElement('button');
      backBtn.className = 'btn-ghost';
      backBtn.textContent = 'Back';
      backBtn.style.touchAction = 'manipulation';
      backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeForm();
      });
      pairDiv.appendChild(backBtn);

      formContainer.appendChild(pairDiv);
    }

    function closeForm() {
      if (openFormRowId === null) return;
      const taskDiv = taskEl(openFormRowId);
      if (taskDiv) {
        const formContainer = taskDiv.querySelector('.ho-t-form');
        if (formContainer) {
          formContainer.style.display = 'none';
          formContainer.innerHTML = '';
        }
      }
      openFormRowId = null;
      openFormType = null;
    }

    function taskEl(rowId) {
      return mount.querySelector('.ho-task[data-id="' + String(Number(rowId)) + '"]');
    }

    function showError(taskDiv, message) {
      let errEl = taskDiv.querySelector('.ho-err');
      if (!errEl) {
        errEl = document.createElement('p');
        errEl.className = 'ho-err';
        taskDiv.appendChild(errEl);
      }
      const m = String(message || '');
      const code = (m.match(/HO_[A-Z_]+/) || [''])[0];
      const plain = {
        HO_CAP: 'Today\'s limit of 200 sent tasks is reached.',
        HO_NOT_YOURS: 'This task is not yours to change.',
        HO_STATE: 'This task has already moved on. Refresh to see it.',
        HO_NOT_FOUND: 'This task is no longer there.'
      };
      const displayMsg = code === 'HO_BAD_INPUT' ? m.slice(m.indexOf(':') + 1).trim()
        : (plain[code] || 'That did not go through. Check the connection and try again.');
      errEl.textContent = displayMsg;
      errEl.style.display = 'block';
    }

    mount.innerHTML = '';
    mount.hidden = true;
    startTimer();
    reload();

    return {
      reload: reload
    };
  };
})();
