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
          courseAssignments.push({
            courseIndex: k,
            courseName: courses[k] || `科目${k + 1}`,
            hours: hours,
            teacherIndex: finalTeacherIndex,
            teacherName: finalTeacherIndex !== null ? (teachers[finalTeacherIndex] || `教師${finalTeacherIndex + 1}`) : '',
            roomIndex: roomIndex,
            roomName: roomIndex !== null ? (rooms[roomIndex] || `教室${roomIndex + 1}`) : ''
          });
        }
      }
      curriculums.push(courseAssignments);
    }
    return curriculums;
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
    getSampleData
  };
})();
