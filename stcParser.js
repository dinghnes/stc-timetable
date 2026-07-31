/**
 * STC Class Scheduling File Parser & Decoder
 * Decodes traditional STC (v3.77) ASCII-offset data files & 115-1 Official Timetable CSV
 */

window.StcParser = (function () {
  function decodeByteCode(charCode) {
    if (typeof charCode === 'string') {
      charCode = charCode.charCodeAt(0);
    }
    const val = charCode - 48;
    return val >= 0 ? val : 0;
  }

  function parseClassNum(lines) {
    const cleanLines = lines.map(l => l.trim()).filter(l => l.length > 0);
    if (cleanLines.length < 6) {
      return { gradeCounts: [4, 5, 5, 5, 5, 5], classes: [] };
    }
    const gradeCounts = cleanLines.slice(0, 6).map(n => parseInt(n, 10) || 0);
    const classes = [];
    let idCounter = 0;
    gradeCounts.forEach((count, gIdx) => {
      const gNum = gIdx + 1;
      for (let c = 1; c <= count; c++) {
        classes.push({ id: idCounter++, grade: gNum, classNum: c, name: `${gNum}年${c}班` });
      }
    });
    return { gradeCounts, classes };
  }

  function parseNameList(textLines) {
    return textLines.map(l => l.trim()).filter(l => l.length > 0);
  }

  function matchRoomForCourse(cName) {
    if (cName.includes('資訊') || cName.includes('電腦')) return '電腦教室';
    if (cName.includes('音樂')) return '音樂教室';
    if (cName.includes('自然')) return '自然教室1';
    if (cName.includes('英語')) return '英語教室';
    if (cName.includes('閱讀')) return '圖書室1';
    return '';
  }

  function parseClassCur(curLines, courses, teachers, rooms, classCount) {
    const curriculums = [];
    for (let i = 0; i < classCount; i++) {
      const lineHours = curLines[2 * i] || '';
      const lineAssign = curLines[2 * i + 1] || '';

      let htIndex = null;
      for (let chIdx = 0; chIdx < lineAssign.length; chIdx++) {
        const code = lineAssign.charCodeAt(chIdx);
        if (code >= 65 && code <= 90) {
          const tIdx = code - 55 - 1;
          if (tIdx >= 0 && tIdx < teachers.length) {
            htIndex = tIdx;
            break;
          }
        }
      }

      const courseAssignments = [];
      const len = Math.min(17, lineHours.length);

      for (let k = 0; k < len; k++) {
        const hChar = lineHours.charAt(k);
        const hours = parseInt(hChar, 10) || 0;

        let teacherIndex = null;
        let roomIndex = null;

        if (2 * k < lineAssign.length) {
          const tCode = decodeByteCode(lineAssign.charCodeAt(2 * k));
          if (tCode > 0 && tCode <= teachers.length) {
            teacherIndex = tCode - 1;
          }
        }
        if (2 * k + 1 < lineAssign.length) {
          const rCode = decodeByteCode(lineAssign.charCodeAt(2 * k + 1));
          if (rCode > 0 && rCode <= rooms.length) {
            roomIndex = rCode - 1;
          }
        }

        const finalTeacherIndex = teacherIndex !== null ? teacherIndex : htIndex;

        if (hours > 0) {
          const cName = courses[k] || `科目${k + 1}`;
          const autoRoomName = matchRoomForCourse(cName);
          const autoRoomIndex = autoRoomName ? rooms.indexOf(autoRoomName) : roomIndex;

          courseAssignments.push({
            courseIndex: k,
            courseName: cName,
            hours: hours,
            teacherIndex: finalTeacherIndex,
            teacherName: finalTeacherIndex !== null ? (teachers[finalTeacherIndex] || `教師${finalTeacherIndex + 1}`) : '',
            roomIndex: autoRoomIndex >= 0 ? autoRoomIndex : null,
            roomName: autoRoomName || (roomIndex !== null ? (rooms[roomIndex] || '') : '')
          });
        }
      }
      curriculums.push(courseAssignments);
    }
    return curriculums;
  }

  function parseCSVText(csvContent) {
    const lines = csvContent.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length <= 1) return null;

    const dayMap = { '週一': 1, '週二': 2, '週三': 3, '週四': 4, '週五': 5, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5 };
    const periodMap = { '第一節': 1, '第二節': 2, '第三節': 3, '第四節': 4, '第五節': 5, '第六節': 6, '第七節': 7, '第八節': 8, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7 };
    const gradeMap = { '一年級': 1, '二年級': 2, '三年級': 3, '四年級': 4, '五年級': 5, '六年級': 6, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6 };

    const clean = s => s ? s.replace(/^"/, '').replace(/"$/, '').trim() : '';

    const rows = [];
    const classSet = new Set();
    const teacherSet = new Set();
    const courseSet = new Set();

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map(clean);
      if (parts.length >= 6) {
        const dayStr = parts[0];
        const periodStr = parts[1];
        const gradeStr = parts[2];
        const classStr = parts[3];
        const tName = parts[4];
        const cName = parts[5];

        const day = dayMap[dayStr] || 1;
        const period = periodMap[periodStr] || 1;
        const grade = gradeMap[gradeStr] || 1;
        const cNum = parseInt(classStr.replace('第', '').replace('班', ''), 10) || 1;
        const className = `${grade}年${cNum}班`;

        classSet.add(className);
        if (tName) teacherSet.add(tName);
        if (cName) courseSet.add(cName);

        rows.push({ day, period, grade, cNum, className, tName, cName });
      }
    }

    const sortedClassNames = Array.from(classSet).sort();
    const classes = sortedClassNames.map((name, id) => {
      const match = name.match(/(\d+)年(\d+)班/);
      return { id, grade: match ? parseInt(match[1], 10) : 1, classNum: match ? parseInt(match[2], 10) : 1, name };
    });

    const teachers = Array.from(teacherSet).sort();
    const courses = Array.from(courseSet).sort();
    const rooms = ["電腦教室", "音樂教室", "英語教室", "自然教室1", "自然教室2", "圖書室1", "圖書室2"];

    const classIdMap = {};
    classes.forEach(c => classIdMap[c.name] = c.id);
    const teacherIdMap = {};
    teachers.forEach((t, i) => teacherIdMap[t] = i);
    const courseIdMap = {};
    courses.forEach((c, i) => courseIdMap[c] = i);
    const roomIdMap = {};
    rooms.forEach((r, i) => roomIdMap[r] = i);

    const scheduleMap = {};
    rows.forEach(r => {
      const cid = classIdMap[r.className];
      const tid = teacherIdMap[r.tName];
      const cidx = courseIdMap[r.cName];

      const rName = matchRoomForCourse(r.cName);
      const rid = rName ? roomIdMap[rName] : null;

      if (cid !== undefined) {
        const slotKey = `${cid}_${r.day}_${r.period}`;
        scheduleMap[slotKey] = {
          classId: cid,
          className: r.className,
          day: r.day,
          period: r.period,
          courseIndex: cidx,
          courseName: r.cName,
          teacherIndex: tid,
          teacherName: r.tName,
          roomIndex: rid,
          roomName: rName
        };
      }
    });

    return {
      academicYear: '115-1',
      schoolName: '西寧國小',
      classes, courses, teachers, rooms,
      classCurriculums: [],
      preScheduledMap: scheduleMap
    };
  }

  function getSampleData() {
    if (window.STC_SAMPLE_DATA_115) {
      return JSON.parse(JSON.stringify(window.STC_SAMPLE_DATA_115));
    }
    if (window.STC_SAMPLE_DATA_114) {
      return JSON.parse(JSON.stringify(window.STC_SAMPLE_DATA_114));
    }
    return null;
  }

  return {
    decodeByteCode,
    parseClassNum,
    parseNameList,
    parseClassCur,
    parseCSVText,
    getSampleData
  };
})();
