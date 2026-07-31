/**
 * STC Smart Timetable Application Logic (UI, State, Drag & Drop, Renderers, Auto-Save, CSV & STC Import)
 */

(function () {
  // Global State
  let dataset = null;
  let scheduleMap = {};
  let teacherUnavailability = {};
  let activeTab = 'master-view';

  const STORAGE_KEY_MAP = 'STC_SAVED_SCHEDULE_MAP_115_V4';
  const STORAGE_KEY_UNAVAIL = 'STC_SAVED_UNAVAILABILITY_115_V4';

  // Selection states
  let selectedClassId = 0;
  let selectedTeacherIndex = 0;
  let selectedRoomIndex = 0;
  let configTeacherIndex = 0;

  // Drag and Drop state
  let draggedSource = null;

  function getCourseType(name) {
    if (!name) return '';
    if (name.includes('國語')) return 'chinese';
    if (name.includes('數學')) return 'math';
    if (name.includes('體育') || name.includes('健康')) return 'pe';
    if (name.includes('自然') || name.includes('資訊')) return 'science';
    if (name.includes('音樂')) return 'music';
    if (name.includes('藝術') || name.includes('美術')) return 'art';
    return '';
  }

  document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initEventListeners();

    // Auto-load 115-1 dataset
    const sample = StcParser.getSampleData();
    if (sample) {
      loadDataset(sample);
    }
  });

  function initTabs() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const targetId = tab.getAttribute('data-tab');
        document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
        document.getElementById(targetId).classList.add('active');
        activeTab = targetId;

        renderActiveView();
      });
    });
  }

  function initEventListeners() {
    document.getElementById('class-select').addEventListener('change', (e) => {
      selectedClassId = parseInt(e.target.value, 10);
      renderClassGrid();
    });

    document.getElementById('teacher-select').addEventListener('change', (e) => {
      selectedTeacherIndex = parseInt(e.target.value, 10);
      renderTeacherGrid();
    });

    document.getElementById('room-select').addEventListener('change', (e) => {
      selectedRoomIndex = parseInt(e.target.value, 10);
      renderRoomGrid();
    });

    document.getElementById('config-teacher-select').addEventListener('change', (e) => {
      configTeacherIndex = parseInt(e.target.value, 10);
      renderUnavailabilityGrid();
    });

    document.getElementById('master-grade-filter').addEventListener('change', renderMasterGrid);
    document.getElementById('master-search').addEventListener('input', renderMasterGrid);

    document.getElementById('btn-run-solver').addEventListener('click', () => runAutoScheduler(true));
    document.getElementById('btn-reset-schedule').addEventListener('click', resetSchedule);

    document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
    document.getElementById('btn-print-master').addEventListener('click', () => window.print());

    document.getElementById('btn-load-sample-114').addEventListener('click', () => {
      localStorage.removeItem(STORAGE_KEY_MAP);
      localStorage.removeItem(STORAGE_KEY_UNAVAIL);
      teacherUnavailability = {};
      const sample = StcParser.getSampleData();
      if (sample) {
        loadDataset(sample, true);
        alert('已成功重新載入 115-1 官方課表（含電腦教室、音樂教室等專科教室對應）！');
      }
    });

    // File Upload Inputs
    document.getElementById('stc-file-input').addEventListener('change', handleFileImport);
    document.getElementById('csv-file-input').addEventListener('change', handleCSVImport);
  }

  // Persistent LocalStorage Save & Load
  function saveToLocalStorage() {
    try {
      localStorage.setItem(STORAGE_KEY_MAP, JSON.stringify(scheduleMap));
      localStorage.setItem(STORAGE_KEY_UNAVAIL, JSON.stringify(teacherUnavailability));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  }

  function loadFromLocalStorage() {
    try {
      const savedMap = localStorage.getItem(STORAGE_KEY_MAP);
      const savedUnavail = localStorage.getItem(STORAGE_KEY_UNAVAIL);

      if (savedUnavail) {
        teacherUnavailability = JSON.parse(savedUnavail);
      }
      if (savedMap) {
        return JSON.parse(savedMap);
      }
    } catch (e) {
      console.warn('LocalStorage load failed:', e);
    }
    return null;
  }

  function loadDataset(data, forceDefault = false) {
    dataset = data;
    populateDropdowns();

    const localSavedMap = forceDefault ? null : loadFromLocalStorage();

    if (localSavedMap && Object.keys(localSavedMap).length > 0) {
      scheduleMap = localSavedMap;
    } else if (data.preScheduledMap && Object.keys(data.preScheduledMap).length > 0) {
      scheduleMap = data.preScheduledMap;
    } else {
      runAutoScheduler(false);
    }

    const conflicts = SchedulerEngine.detectConflicts(scheduleMap, teacherUnavailability);
    updateBadges(conflicts);
    renderActiveView();
  }

  function populateDropdowns() {
    if (!dataset) return;

    const classSel = document.getElementById('class-select');
    classSel.innerHTML = dataset.classes.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    if (dataset.classes.length > 0) selectedClassId = dataset.classes[0].id;

    const teacherSel = document.getElementById('teacher-select');
    const configTeacherSel = document.getElementById('config-teacher-select');
    const teacherOptions = dataset.teachers.map((t, idx) => `<option value="${idx}">${idx + 1}. ${t}</option>`).join('');
    teacherSel.innerHTML = teacherOptions;
    configTeacherSel.innerHTML = teacherOptions;
    if (dataset.teachers.length > 0) {
      selectedTeacherIndex = 0;
      configTeacherIndex = 0;
    }

    const roomSel = document.getElementById('room-select');
    roomSel.innerHTML = dataset.rooms.map((r, idx) => `<option value="${idx}">${r}</option>`).join('');
    if (dataset.rooms.length > 0) selectedRoomIndex = 0;
  }

  function runAutoScheduler(showAlert = true) {
    if (!dataset) return;
    const res = SchedulerEngine.autoSchedule(dataset.classes, dataset.classCurriculums, teacherUnavailability);
    scheduleMap = res.scheduleMap;

    saveToLocalStorage();
    updateBadges(res.conflicts);
    renderActiveView();

    const statsBox = document.getElementById('solver-stats-box');
    statsBox.style.display = 'block';
    statsBox.innerHTML = `
      <div style="font-weight: 700; color: #6ee7b7; margin-bottom: 0.5rem;">🎉 智慧重新排課完成！</div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; font-size: 0.85rem; color: var(--text-sub);">
        <div>耗時：<strong style="color: white;">${res.stats.timeTakenMs} ms</strong></div>
        <div>總課程單位：<strong style="color: white;">${res.stats.totalLessons} 節</strong></div>
        <div>成功排入：<strong style="color: white;">${res.stats.assignedCount} 節</strong></div>
        <div>剩餘衝突：<strong style="color: ${res.stats.conflictCount === 0 ? '#6ee7b7' : '#fca5a5'};">${res.stats.conflictCount} 處</strong></div>
      </div>
    `;

    if (showAlert && res.stats.conflictCount === 0) {
      alert(`智慧重新排課成功！在 ${res.stats.timeTakenMs}ms 內完成 ${res.stats.totalLessons} 節課程排定，全校 0 衝堂！已自動存檔！`);
    }
  }

  function resetSchedule() {
    if (confirm('確定要清空全校課表嗎？')) {
      scheduleMap = {};
      saveToLocalStorage();
      updateBadges();
      renderActiveView();
    }
  }

  function renderActiveView() {
    if (!dataset) return;
    switch (activeTab) {
      case 'master-view': renderMasterGrid(); break;
      case 'class-view': renderClassGrid(); break;
      case 'teacher-view': renderTeacherGrid(); break;
      case 'room-view': renderRoomGrid(); break;
      case 'config-view': renderUnavailabilityGrid(); break;
    }
  }

  function renderMasterGrid() {
    const table = document.getElementById('master-grid-table');
    if (!dataset) return;

    const gradeFilter = document.getElementById('master-grade-filter').value;
    const searchQuery = document.getElementById('master-search').value.trim().toLowerCase();

    let filteredClasses = dataset.classes;
    if (gradeFilter !== 'all') {
      filteredClasses = filteredClasses.filter(c => c.grade === parseInt(gradeFilter, 10));
    }

    let html = `<thead><tr><th class="class-name-col">班級</th>`;
    for (let d = 1; d <= 5; d++) {
      const dayNames = ['一', '二', '三', '四', '五'];
      for (let p = 1; p <= 7; p++) {
        html += `<th>週${dayNames[d - 1]}P${p}</th>`;
      }
    }
    html += `</tr></thead><tbody>`;

    filteredClasses.forEach(cls => {
      html += `<tr><td class="class-name-col">${cls.name}</td>`;
      for (let d = 1; d <= 5; d++) {
        const maxP = SchedulerEngine.getMaxPeriodsForClass(cls.grade, d);
        for (let p = 1; p <= 7; p++) {
          if (p > maxP) {
            html += `<td style="background: rgba(0,0,0,0.3); color: #64748b; font-size: 0.7rem;">-</td>`;
            continue;
          }

          const slotKey = `${cls.id}_${d}_${p}`;
          const item = scheduleMap[slotKey];

          if (item) {
            let match = true;
            if (searchQuery) {
              match = (item.courseName && item.courseName.toLowerCase().includes(searchQuery)) ||
                      (item.teacherName && item.teacherName.toLowerCase().includes(searchQuery)) ||
                      (item.roomName && item.roomName.toLowerCase().includes(searchQuery));
            }

            const opacity = match ? '1' : '0.2';
            html += `<td>
              <span class="mini-badge" style="opacity: ${opacity};" title="${cls.name} 星期${d} 第${p}節\n課程：${item.courseName}\n教師：${item.teacherName || '無'}\n教室：${item.roomName || '原班'}">
                ${item.courseName}<br><small style="font-size:0.65rem; color:#cbd5e1;">${item.teacherName || ''}</small>
              </span>
            </td>`;
          } else {
            html += `<td></td>`;
          }
        }
      }
      html += `</tr>`;
    });

    html += `</tbody>`;
    table.innerHTML = html;
  }

  function renderClassGrid() {
    const body = document.getElementById('class-grid-body');
    if (!dataset) return;

    const cls = dataset.classes.find(c => c.id === selectedClassId);
    if (!cls) return;

    const periodTimes = [
      '08:40 - 09:20', '09:30 - 10:10', '10:30 - 11:10', '11:20 - 12:00',
      '13:20 - 14:00', '14:10 - 14:50', '15:10 - 15:50'
    ];

    let html = '';
    for (let p = 1; p <= 7; p++) {
      html += `<tr><td class="period-header">第 ${p} 節<small>${periodTimes[p - 1]}</small></td>`;

      for (let d = 1; d <= 5; d++) {
        const maxP = SchedulerEngine.getMaxPeriodsForClass(cls.grade, d);
        const slotKey = `${cls.id}_${d}_${p}`;
        const item = scheduleMap[slotKey];

        if (p > maxP) {
          html += `<td class="is-unavailable" title="半天不排課"></td>`;
        } else {
          html += `<td data-class-id="${cls.id}" data-day="${d}" data-period="${p}" class="slot-cell">`;
          if (item) {
            const type = getCourseType(item.courseName);
            html += `
              <div class="course-card" data-type="${type}" draggable="true" data-slot-key="${slotKey}">
                <div class="course-title">${item.courseName}</div>
                <div class="course-meta">
                  <span>👤 ${item.teacherName || '未指定'}</span>
                  ${item.roomName ? `<span class="course-tag">🏫 ${item.roomName}</span>` : ''}
                </div>
              </div>
            `;
          }
          html += `</td>`;
        }
      }
      html += `</tr>`;
    }

    body.innerHTML = html;
    attachDragAndDropListeners();
  }

  function attachDragAndDropListeners() {
    const cards = document.querySelectorAll('.course-card');
    const cells = document.querySelectorAll('.slot-cell');

    cards.forEach(card => {
      card.addEventListener('dragstart', (e) => {
        const slotKey = card.getAttribute('data-slot-key');
        const item = scheduleMap[slotKey];
        draggedSource = { slotKey, item };
        card.classList.add('dragging');
        e.dataTransfer.setData('text/plain', slotKey);
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        cells.forEach(c => c.classList.remove('drop-target'));
      });
    });

    cells.forEach(cell => {
      cell.addEventListener('dragover', (e) => {
        e.preventDefault();
        cell.classList.add('drop-target');
      });

      cell.addEventListener('dragleave', () => {
        cell.classList.remove('drop-target');
      });

      cell.addEventListener('drop', (e) => {
        e.preventDefault();
        cell.classList.remove('drop-target');

        if (!draggedSource) return;

        const targetClassId = parseInt(cell.getAttribute('data-class-id'), 10);
        const targetDay = parseInt(cell.getAttribute('data-day'), 10);
        const targetPeriod = parseInt(cell.getAttribute('data-period'), 10);
        const targetKey = `${targetClassId}_${targetDay}_${targetPeriod}`;

        const sourceItem = scheduleMap[draggedSource.slotKey];
        const targetItem = scheduleMap[targetKey];

        if (sourceItem) { sourceItem.day = targetDay; sourceItem.period = targetPeriod; }
        if (targetItem) { targetItem.day = draggedSource.item.day; targetItem.period = draggedSource.item.period; }

        scheduleMap[targetKey] = sourceItem;
        if (targetItem) {
          scheduleMap[draggedSource.slotKey] = targetItem;
        } else {
          delete scheduleMap[draggedSource.slotKey];
        }

        saveToLocalStorage();
        const conflicts = SchedulerEngine.detectConflicts(scheduleMap, teacherUnavailability);
        updateBadges(conflicts);
        renderClassGrid();
      });
    });
  }

  function renderTeacherGrid() {
    const body = document.getElementById('teacher-grid-body');
    const info = document.getElementById('teacher-load-info');
    if (!dataset) return;

    const teacherName = dataset.teachers[selectedTeacherIndex];
    let totalHours = 0;

    let html = '';
    for (let p = 1; p <= 7; p++) {
      html += `<tr><td class="period-header">第 ${p} 節</td>`;
      for (let d = 1; d <= 5; d++) {
        let matchedItem = null;
        for (const [key, item] of Object.entries(scheduleMap)) {
          if (item && item.teacherIndex === selectedTeacherIndex) {
            const parts = key.split('_');
            if (parseInt(parts[1], 10) === d && parseInt(parts[2], 10) === p) {
              matchedItem = item;
              totalHours++;
              break;
            }
          }
        }

        const unavailKey = `${selectedTeacherIndex}_${d}_${p}`;
        const isUnavail = teacherUnavailability[unavailKey];

        if (isUnavail) {
          html += `<td class="is-unavailable"></td>`;
        } else if (matchedItem) {
          html += `<td>
            <div class="course-card" data-type="${getCourseType(matchedItem.courseName)}">
              <div class="course-title">${matchedItem.className} - ${matchedItem.courseName}</div>
              <div class="course-meta">${matchedItem.roomName ? `🏫 ${matchedItem.roomName}` : '原班'}</div>
            </div>
          </td>`;
        } else {
          html += `<td></td>`;
        }
      }
      html += `</tr>`;
    }

    body.innerHTML = html;
    info.innerHTML = `👨‍🏫 <strong>${teacherName}</strong> 老師：本週共 <strong>${totalHours}</strong> 節課`;
  }

  function renderRoomGrid() {
    const body = document.getElementById('room-grid-body');
    if (!dataset) return;

    const selectedRoomName = dataset.rooms[selectedRoomIndex];

    let html = '';
    for (let p = 1; p <= 7; p++) {
      html += `<tr><td class="period-header">第 ${p} 節</td>`;
      for (let d = 1; d <= 5; d++) {
        let matchedItem = null;
        for (const [key, item] of Object.entries(scheduleMap)) {
          if (!item) continue;
          const parts = key.split('_');
          const slotDay = parseInt(parts[1], 10);
          const slotPeriod = parseInt(parts[2], 10);

          if (slotDay === d && slotPeriod === p) {
            // Match roomIndex or roomName
            if (item.roomIndex === selectedRoomIndex || item.roomName === selectedRoomName) {
              matchedItem = item;
              break;
            }
            // Fallback match: if course is 資訊/電腦 and room is 電腦教室
            if (selectedRoomName === '電腦教室' && (item.courseName.includes('資訊') || item.courseName.includes('電腦'))) {
              matchedItem = item;
              break;
            }
            if (selectedRoomName === '音樂教室' && item.courseName.includes('音樂')) {
              matchedItem = item;
              break;
            }
          }
        }

        if (matchedItem) {
          html += `<td>
            <div class="course-card" data-type="science">
              <div class="course-title">${matchedItem.className}</div>
              <div class="course-meta">${matchedItem.courseName} (${matchedItem.teacherName || '無'})</div>
            </div>
          </td>`;
        } else {
          html += `<td></td>`;
        }
      }
      html += `</tr>`;
    }
    body.innerHTML = html;
  }

  function renderUnavailabilityGrid() {
    const body = document.getElementById('unavailability-grid-body');
    if (!dataset) return;

    let html = '';
    for (let p = 1; p <= 7; p++) {
      html += `<tr><td class="period-header">第 ${p} 節</td>`;
      for (let d = 1; d <= 5; d++) {
        const uKey = `${configTeacherIndex}_${d}_${p}`;
        const isUnavail = !!teacherUnavailability[uKey];
        html += `<td data-day="${d}" data-period="${p}" class="unavail-cell ${isUnavail ? 'selected-unavailable' : ''}"></td>`;
      }
      html += `</tr>`;
    }

    body.innerHTML = html;

    document.querySelectorAll('.unavail-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const d = cell.getAttribute('data-day');
        const p = cell.getAttribute('data-period');
        const uKey = `${configTeacherIndex}_${d}_${p}`;

        if (teacherUnavailability[uKey]) {
          delete teacherUnavailability[uKey];
        } else {
          teacherUnavailability[uKey] = true;
        }

        saveToLocalStorage();
        renderUnavailabilityGrid();
        const conflicts = SchedulerEngine.detectConflicts(scheduleMap, teacherUnavailability);
        updateBadges(conflicts);
      });
    });
  }

  function updateBadges(conflicts = null) {
    if (!conflicts) {
      conflicts = SchedulerEngine.detectConflicts(scheduleMap, teacherUnavailability);
    }

    if (dataset) {
      document.getElementById('badge-classes').innerText = `🏫 ${dataset.classes.length} 班`;
      document.getElementById('badge-teachers').innerText = `👨‍🏫 ${dataset.teachers.length} 位教師`;
    }

    const confBadge = document.getElementById('badge-conflicts');
    const drawer = document.getElementById('conflict-panel');
    const drawerBadge = document.getElementById('conflict-count-badge');
    const drawerBody = document.getElementById('conflict-list-body');

    if (conflicts.length === 0) {
      confBadge.className = 'badge badge-success';
      confBadge.innerText = '✔ 0 衝突';
      drawer.style.display = 'none';
    } else {
      confBadge.className = 'badge badge-danger';
      confBadge.innerText = `⚠️ ${conflicts.length} 衝突`;
      drawer.style.display = 'block';
      drawerBadge.innerText = `${conflicts.length} 個衝突`;

      drawerBody.innerHTML = conflicts.map(c => `
        <div class="conflict-item">
          <span>${c.message}</span>
          <span style="font-size:0.75rem; color:#cbd5e1;">[<sup>星期${c.day} 第${c.period}節</sup>]</span>
        </div>
      `).join('');
    }
  }

  function exportCSV() {
    if (!dataset) return;
    let csv = '\uFEFF班級,星期,節次,課程名稱,授課教師,專科教室\n';

    for (const [key, item] of Object.entries(scheduleMap)) {
      if (!item) continue;
      const parts = key.split('_');
      const cls = dataset.classes.find(c => c.id === parseInt(parts[0], 10));
      const dayNames = ['', '一', '二', '三', '四', '五'];
      const className = cls ? cls.name : `班級${parts[0]}`;
      csv += `"${className}","星期${dayNames[parts[1]]}","第${parts[2]}節","${item.courseName}","${item.teacherName || ''}","${item.roomName || ''}"\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `西寧國小_115-1_課表匯出_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  }

  function handleCSVImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const status = document.getElementById('csv-import-status');
    status.innerText = `讀取中 (${file.name})...`;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const csvContent = evt.target.result;
      const parsedData = StcParser.parseCSVText(csvContent);

      if (parsedData) {
        localStorage.removeItem(STORAGE_KEY_MAP);
        loadDataset(parsedData, true);
        saveToLocalStorage();
        status.innerText = `✔ CSV 匯入成功！已對接 ${parsedData.classes.length} 班、${parsedData.teachers.length} 位教師與 ${Object.keys(parsedData.preScheduledMap).length} 節排課！`;
      } else {
        status.innerText = `❌ CSV 格式解析失敗，請確認標頭欄位包含：週次,節次,年級,班級,教師姓名,校訂課程名稱`;
      }
    };
    reader.readAsText(file, 'big5');
  }

  function handleFileImport(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    let classNumText = null;
    let coursNamText = null;
    let teachNamText = null;
    let roomNamText = null;
    let classCurLines = [];
    let classTabLines = [];

    const status = document.getElementById('file-import-status');
    status.innerText = `讀取中 (${files.length} 個檔案)...`;

    let readCount = 0;
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const name = file.name;
        if (name.includes('ClassNum')) {
          classNumText = evt.target.result;
        } else if (name.includes('CoursNam')) {
          coursNamText = evt.target.result;
        } else if (name.includes('TeachNam')) {
          teachNamText = evt.target.result;
        } else if (name.includes('RoomNam')) {
          roomNamText = evt.target.result;
        } else if (name.includes('ClassCur')) {
          classCurLines = evt.target.result.split(/\r?\n/);
        } else if (name.includes('ClassTab')) {
          classTabLines = evt.target.result.split(/\r?\n/);
        }

        readCount++;
        if (readCount === files.length) {
          const classesData = classNumText ? StcParser.parseClassNum(classNumText.split(/\r?\n/)) : null;
          const courses = coursNamText ? StcParser.parseNameList(coursNamText.split(/\r?\n/)) : dataset.courses;
          const teachers = teachNamText ? StcParser.parseNameList(teachNamText.split(/\r?\n/)) : dataset.teachers;
          const rooms = roomNamText ? StcParser.parseNameList(roomNamText.split(/\r?\n/)) : dataset.rooms;
          const classes = classesData ? classesData.classes : dataset.classes;

          const classCurriculums = classCurLines.length > 0
            ? StcParser.parseClassCur(classCurLines, courses, teachers, rooms, classes.length)
            : dataset.classCurriculums;

          const preScheduledMap = classTabLines.length > 0
            ? StcParser.parseClassTab(classTabLines, classes, courses, teachers, rooms, classCurriculums, classCurLines)
            : null;

          const customDataset = {
            academicYear: '匯入資料',
            schoolName: '自訂學校',
            classes, courses, teachers, rooms, classCurriculums, preScheduledMap
          };

          localStorage.removeItem(STORAGE_KEY_MAP);
          loadDataset(customDataset, true);
          saveToLocalStorage();
          status.innerText = `✔ 匯入成功！已還原 ${Object.keys(preScheduledMap || {}).length} 節既存課表與 ${teachers.length} 位教師課表！已自動存檔！`;
        }
      };
      reader.readAsText(file, 'big5');
    });
  }

})();
