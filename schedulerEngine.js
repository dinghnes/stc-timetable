/**
 * STC Smart Automatic Scheduler & Conflict Checker Engine (CSP + Heuristic Solver)
 */

window.SchedulerEngine = (function () {
  const DAYS = 5; // Mon..Fri
  const MAX_PERIODS = 7; // 1..7 per day

  /**
   * Determine default max periods for a given grade and day (1..5)
   * Mon=1, Tue=2, Wed=3, Thu=4, Fri=5
   */
  function getMaxPeriodsForClass(grade, day) {
    if (grade <= 2) {
      // Grade 1-2: Tue is full day (7 periods), Mon, Wed, Thu, Fri half day (4 periods)
      return day === 2 ? 7 : 4;
    } else if (grade <= 4) {
      // Grade 3-4: Wed, Fri half day (4 periods), Mon, Tue, Thu full day (7 periods)
      return (day === 3 || day === 5) ? 4 : 7;
    } else {
      // Grade 5-6: Wed half day (4 periods), Mon, Tue, Thu, Fri full day (7 periods)
      return day === 3 ? 4 : 7;
    }
  }

  /**
   * Check all hard conflicts for a proposed schedule matrix
   * @param {Object} scheduleMap - Key: `classId_day_period`, Value: Assignment Object { courseName, teacherIndex, teacherName, roomIndex, roomName }
   * @param {Object} teacherUnavailability - Key: `teacherIndex_day_period`, Value: true
   * @returns {Array} List of conflict objects
   */
  function detectConflicts(scheduleMap, teacherUnavailability = {}) {
    const conflicts = [];
    const teacherSlots = {}; // `tIdx_day_period` -> array of classNames
    const roomSlots = {};    // `rIdx_day_period` -> array of classNames

    for (const [key, item] of Object.entries(scheduleMap)) {
      if (!item || !item.courseName) continue;
      const parts = key.split('_');
      const classId = parseInt(parts[0], 10);
      const day = parseInt(parts[1], 10);
      const period = parseInt(parts[2], 10);

      // 1. Teacher conflict check
      if (item.teacherIndex !== null && item.teacherIndex !== undefined) {
        const tKey = `${item.teacherIndex}_${day}_${period}`;

        // Check unavailability
        if (teacherUnavailability[tKey]) {
          conflicts.push({
            type: 'TEACHER_UNAVAILABLE',
            severity: 'error',
            message: `教師 [${item.teacherName}] 於 星期${day} 第${period}節 設定為不排課`,
            classId, day, period, teacherIndex: item.teacherIndex
          });
        }

        if (!teacherSlots[tKey]) teacherSlots[tKey] = [];
        teacherSlots[tKey].push({ classId, className: item.className || `班級${classId}`, courseName: item.courseName });
      }

      // 2. Room conflict check
      if (item.roomIndex !== null && item.roomIndex !== undefined) {
        const rKey = `${item.roomIndex}_${day}_${period}`;
        if (!roomSlots[rKey]) roomSlots[rKey] = [];
        roomSlots[rKey].push({ classId, className: item.className || `班級${classId}`, roomName: item.roomName });
      }
    }

    // Process Teacher Multi-booking
    for (const [tKey, list] of Object.entries(teacherSlots)) {
      if (list.length > 1) {
        const tIdx = parseInt(tKey.split('_')[0], 10);
        const day = parseInt(tKey.split('_')[1], 10);
        const period = parseInt(tKey.split('_')[2], 10);
        const names = list.map(x => `${x.className}(${x.courseName})`).join(' 與 ');
        conflicts.push({
          type: 'TEACHER_DOUBLE_BOOK',
          severity: 'error',
          message: `教師衝堂！同一時段（星期${day} 第${period}節）排了：${names}`,
          day, period, teacherIndex: tIdx, affectedClasses: list.map(x => x.classId)
        });
      }
    }

    // Process Room Multi-booking
    for (const [rKey, list] of Object.entries(roomSlots)) {
      if (list.length > 1) {
        const rIdx = parseInt(rKey.split('_')[0], 10);
        const day = parseInt(rKey.split('_')[1], 10);
        const period = parseInt(rKey.split('_')[2], 10);
        const names = list.map(x => x.className).join(' 與 ');
        conflicts.push({
          type: 'ROOM_DOUBLE_BOOK',
          severity: 'error',
          message: `專科教室 [${list[0].roomName}] 衝堂！星期${day} 第${period}節 同時借給：${names}`,
          day, period, roomIndex: rIdx, affectedClasses: list.map(x => x.classId)
        });
      }
    }

    return conflicts;
  }

  /**
   * CSP Automatic Class Scheduling Solver
   * @param {Array} classes - List of class objects { id, grade, classNum, name }
   * @param {Array} classCurriculums - Array of course assignment lists per class
   * @param {Object} teacherUnavailability - Teacher unavailabilities map
   * @param {Object} options - Solver options { consecutiveRules, roomLimits }
   * @returns {Object} { scheduleMap, conflicts, stats }
   */
  function autoSchedule(classes, classCurriculums, teacherUnavailability = {}, options = {}) {
    const startTime = performance.now();
    const newScheduleMap = {};
    const teacherUsage = {}; // `tIdx_day_period` -> bool
    const roomUsage = {};    // `rIdx_day_period` -> bool

    // Mark unavailable teacher slots
    for (const uKey of Object.keys(teacherUnavailability)) {
      if (teacherUnavailability[uKey]) {
        teacherUsage[uKey] = true;
      }
    }

    // Build unassigned task queue for each class
    // Each item is a 1-period lesson unit { classId, className, grade, courseName, teacherIndex, teacherName, roomIndex, roomName }
    const lessonPool = [];

    classes.forEach((cls, cIdx) => {
      const curList = classCurriculums[cIdx] || [];
      curList.forEach(item => {
        for (let h = 0; h < item.hours; h++) {
          lessonPool.push({
            classId: cls.id,
            className: cls.name,
            grade: cls.grade,
            courseName: item.courseName,
            teacherIndex: item.teacherIndex,
            teacherName: item.teacherName,
            roomIndex: item.roomIndex,
            roomName: item.roomName
          });
        }
      });
    });

    // Sort lesson pool heuristic: lessons with Room or Teacher first (MRV - Minimum Remaining Values)
    lessonPool.sort((a, b) => {
      const scoreA = (a.roomIndex !== null ? 10 : 0) + (a.teacherIndex !== null ? 5 : 0);
      const scoreB = (b.roomIndex !== null ? 10 : 0) + (b.teacherIndex !== null ? 5 : 0);
      return scoreB - scoreA;
    });

    // Valid slots list per class
    const classValidSlots = {};
    classes.forEach(cls => {
      const slots = [];
      for (let d = 1; d <= DAYS; d++) {
        const maxP = getMaxPeriodsForClass(cls.grade, d);
        for (let p = 1; p <= maxP; p++) {
          slots.push({ day: d, period: p });
        }
      }
      // Shuffle slots slightly for natural distribution
      classValidSlots[cls.id] = slots;
    });

    let assignedCount = 0;
    let failedCount = 0;

    // Greedy Backtracking assignment
    for (const lesson of lessonPool) {
      const slots = classValidSlots[lesson.classId] || [];
      let placed = false;

      // Prefer morning slots (periods 1-4) for core subjects (國語, 數學)
      const isCore = lesson.courseName.includes('國語') || lesson.courseName.includes('數學');

      // Sort candidate slots for this lesson
      const candidateSlots = [...slots].sort((sA, sB) => {
        if (isCore) {
          if (sA.period <= 4 && sB.period > 4) return -1;
          if (sA.period > 4 && sB.period <= 4) return 1;
        }
        return Math.random() - 0.5; // randomize to distribute across days
      });

      for (const slot of candidateSlots) {
        const slotKey = `${lesson.classId}_${slot.day}_${slot.period}`;
        if (newScheduleMap[slotKey]) continue; // class slot already occupied

        const tKey = lesson.teacherIndex !== null ? `${lesson.teacherIndex}_${slot.day}_${slot.period}` : null;
        const rKey = lesson.roomIndex !== null ? `${lesson.roomIndex}_${slot.day}_${slot.period}` : null;

        if (tKey && teacherUsage[tKey]) continue; // teacher busy
        if (rKey && roomUsage[rKey]) continue; // room busy

        // Place lesson!
        newScheduleMap[slotKey] = { ...lesson, day: slot.day, period: slot.period };
        if (tKey) teacherUsage[tKey] = true;
        if (rKey) roomUsage[rKey] = true;
        placed = true;
        assignedCount++;
        break;
      }

      if (!placed) {
        // Fallback: place in any available class slot even if teacher/room conflicts, will be flagged
        for (const slot of slots) {
          const slotKey = `${lesson.classId}_${slot.day}_${slot.period}`;
          if (!newScheduleMap[slotKey]) {
            newScheduleMap[slotKey] = { ...lesson, day: slot.day, period: slot.period };
            assignedCount++;
            failedCount++;
            break;
          }
        }
      }
    }

    const endTime = performance.now();
    const conflicts = detectConflicts(newScheduleMap, teacherUnavailability);

    return {
      scheduleMap: newScheduleMap,
      conflicts,
      stats: {
        timeTakenMs: Math.round(endTime - startTime),
        totalLessons: lessonPool.length,
        assignedCount,
        failedCount,
        conflictCount: conflicts.length
      }
    };
  }

  return {
    DAYS,
    MAX_PERIODS,
    getMaxPeriodsForClass,
    detectConflicts,
    autoSchedule
  };
})();
