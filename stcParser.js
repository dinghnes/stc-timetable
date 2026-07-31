/**
 * STC Class Scheduling File Parser & Decoder
 * Decodes traditional STC (v3.77) ASCII-offset data files into modern JSON schema.
 */

window.StcParser = (function () {
  /**
   * Helper to convert ASCII character offset back to integer index
   * e.g., '0' (48) -> 0, '1' -> 1, '9' -> 9, ':' (58) -> 10, ';' -> 11, '<' -> 12, ... 'A' (65) -> 17
   */
  function decodeByteCode(charCode) {
    if (typeof charCode === 'string') {
      charCode = charCode.charCodeAt(0);
    }
    const val = charCode - 48;
    return val >= 0 ? val : 0;
  }

  /**
   * Parse ClassNum file content (CP950 / ASCII text)
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
        classes.append
          ? classes.push({ id: idCounter++, grade: gNum, classNum: c, name: `${gNum}年${c}班` })
          : classes.push({ id: idCounter++, grade: gNum, classNum: c, name: `${gNum}年${c}班` });
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
            teacherIndex = tCode - 1; // 1-based to 0-based index
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
   * Load sample 114-1 data if available
   */
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
    getSampleData
  };
})();
