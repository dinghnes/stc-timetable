/**
 * STC Class Scheduling File Parser & Decoder
 * Decodes traditional STC (v3.77) ASCII-offset data files into modern JSON schema.
 */

window.StcParser = (function () {
  /**
   * Helper to convert ASCII character offset back to integer index
   */
  function decodeByteCode(charCode) {
    if (typeof charCode === 'string') {
      charCode = charCode.charCodeAt(0);
    }
    const val = charCode - 48;
    return val >= 0 ? val : 0;
  }

  /**
   * Parse ClassNum file content
   */
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

  /**
   * Parse single-line name text files (CoursNam, TeachNam, RoomNam)
   */
  function parseNameList(textLines) {
    return textLines.map(l => l.trim()).filter(l => l.length > 0);
  }

  /**
   * Parse ClassCur file (Curriculum assignments per class)
   */
  function parseClassCur(curLines, courses, teachers, rooms, classCount) {
    const curriculums = [];
    for (let i = 0; i < classCount; i++) {
      const lineHours = curLines[2 * i] || '';
      const lineAssign = curLines[2 * i + 1] || '';

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

        if (hours > 0) {
          courseAssignments.push({
            courseIndex: k,
            courseName: courses[k] || `科目${k + 1}`,
            hours: hours,
            teacherIndex: teacherIndex,
            teacherName: teacherIndex !== null ? (teachers[teacherIndex] || `教師${teacherIndex + 1}`) : '',
            roomIndex: roomIndex,
            roomName: roomIndex !== null ? (rooms[roomIndex] || `教室${roomIndex + 1}`) : ''
          });
        }
      }
      curriculums.push(courseAssignments);
    }
    return curriculums;
  }

  /**
   * Parse pre-scheduled ClassTab lines
   */
  function parseClassTab(tabLines, classes, courses, teachers, rooms, classCurriculums) {
    const scheduleMap = {};
    classes.forEach((cls, cIdx) => {
      if (cIdx < tabLines.length) {
        const line = tabLines[cIdx];
        const numSlots = Math.min(32, Math.floor(line.length / 3));

        for (let slotIdx = 0; slotIdx < numSlots; slotIdx++) {
          const b0 = decodeByteCode(line.charCodeAt(3 * slotIdx));
          const b1 = decodeByteCode(line.charCodeAt(3 * slotIdx + 1));
          const b2 = decodeByteCode(line.charCodeAt(3 * slotIdx + 2));

          let cIdxMatch = null;
          let tIdxMatch = null;
          let rIdxMatch = null;

          if (b2 > 0 && b2 <= courses.length) cIdxMatch = b2 - 1;
          else if (b1 > 0 && b1 <= courses.length) cIdxMatch = b1 - 1;
          else if (b0 > 0 && b0 <= courses.length) cIdxMatch = b0 - 1;

          if (b0 > 0 && b0 <= teachers.length) tIdxMatch = b0 - 1;
          if (b1 > 0 && b1 <= rooms.length) rIdxMatch = b1 - 1;

          const cur = classCurriculums[cIdx] || [];
          if (cIdxMatch !== null && tIdxMatch === null) {
            const matchedCur = cur.find(item => item.courseIndex === cIdxMatch);
            if (matchedCur && matchedCur.teacherIndex !== null) {
              tIdxMatch = matchedCur.teacherIndex;
            }
          }

          if (cIdxMatch !== null) {
            const day = Math.floor(slotIdx / 7) + 1;
            const period = (slotIdx % 7) + 1;
            if (day <= 5 && period <= 7) {
              const slotKey = `${cls.id}_${day}_${period}`;
              scheduleMap[slotKey] = {
                classId: cls.id,
                className: cls.name,
                day,
                period,
                courseIndex: cIdxMatch,
                courseName: courses[cIdxMatch] || `科目${cIdxMatch + 1}`,
                teacherIndex: tIdxMatch,
                teacherName: tIdxMatch !== null ? (teachers[tIdxMatch] || '') : '',
                roomIndex: rIdxMatch,
                roomName: rIdxMatch !== null ? (rooms[rIdxMatch] || '') : ''
              };
            }
          }
        }
      }
    });
    return scheduleMap;
  }

  function getSampleData() {
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
    parseClassTab,
    getSampleData
  };
})();
