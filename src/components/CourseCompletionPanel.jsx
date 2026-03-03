import { useState } from 'react';

/**
 * CourseCompletionPanel
 *
 * Props:
 *   completions  — array returned from GET /hs/completion/:userId  (courses[])
 *   loading      — boolean
 *   error        — string | null
 */

// Highspot status values: "Passed", "Failed", "Completed", "In Progress", "Not Started"
const isComplete   = (s) => { const v = (s || '').toLowerCase(); return v.startsWith('complet') || v === 'passed'; };
const isInProgress = (s) => { const v = (s || '').toLowerCase(); return v.includes('progress') || v === 'in_progress'; };
const isFailed     = (s) => (s || '').toLowerCase() === 'failed';

function statusColor(status) {
  if (isComplete(status))   return '#16a34a';
  if (isFailed(status))     return '#dc2626';
  if (isInProgress(status)) return '#d97706';
  return '#94a3b8';
}

function statusLabel(status) {
  const s = (status || '').toLowerCase();
  if (s === 'passed')       return 'Passed';
  if (s === 'failed')       return 'Failed';
  if (isComplete(status))   return 'Complete';
  if (isInProgress(status)) return 'In progress';
  if (s === 'submitted')    return 'Submitted';
  if (s === 'reviewed')     return 'Reviewed';
  return 'Not started';
}

function StatusBadge({ status }) {
  const color = statusColor(status);
  const label = statusLabel(status);
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '12px',
      fontSize: '0.72rem',
      fontWeight: 600,
      background: `${color}18`,
      color,
      border: `1px solid ${color}40`,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function ProgressBar({ pct, color }) {
  const safe = Math.min(100, Math.max(0, pct ?? 0));
  const barColor = color || (safe === 100 ? '#16a34a' : safe > 0 ? '#2563eb' : '#e2e8f0');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: '#e2e8f0', overflow: 'hidden' }}>
        <div style={{ width: `${safe}%`, height: '100%', borderRadius: '4px', background: barColor, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', minWidth: '32px', textAlign: 'right' }}>{safe}%</span>
    </div>
  );
}

function SAScoreBadge({ score }) {
  if (score == null) return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', background: '#f3e8ff', border: '1px solid #c4b5fd', fontSize: '0.65rem', fontWeight: 700, color: '#7c3aed' }}>
      —
    </span>
  );
  const rounded = Math.round(score * 10) / 10;
  const color = rounded >= 4 ? '#16a34a' : rounded >= 3 ? '#d97706' : '#dc2626';
  const bg = rounded >= 4 ? '#dcfce7' : rounded >= 3 ? '#fef3c7' : '#fee2e2';
  const border = rounded >= 4 ? '#86efac' : rounded >= 3 ? '#fde68a' : '#fca5a5';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', background: bg, border: `1px solid ${border}`, fontSize: '0.7rem', fontWeight: 700, color }}>
      {rounded.toFixed(1)}
    </span>
  );
}

function ScoreChip({ score }) {
  if (score == null) return null;
  const rounded = Math.round(score * 10) / 10;
  const color = rounded >= 4 ? '#16a34a' : rounded >= 3 ? '#d97706' : '#dc2626';
  return (
    <span style={{ fontWeight: 700, color, fontSize: '0.875rem' }}>
      {rounded.toFixed(1)}
    </span>
  );
}

function LessonRow({ lesson }) {
  const comp = lesson.completion;
  return (
    <tr>
      <td style={{ padding: '6px 8px', fontSize: '0.8125rem', color: '#374151' }}>{lesson.name}</td>
      <td style={{ padding: '6px 8px' }}>
        <StatusBadge status={comp?.completion_status} />
      </td>
      <td style={{ padding: '6px 8px', fontSize: '0.8125rem', color: '#64748b' }}>
        {comp?.submitted_at ? new Date(comp.submitted_at).toLocaleDateString() : '—'}
      </td>
    </tr>
  );
}

function saStatusLabel(comp) {
  if (!comp) return 'Not started';
  if (comp.reviewed_at || isComplete(comp.completion_status)) return 'Complete';
  if (comp.submitted_at) return 'Submitted';
  if (isInProgress(comp.completion_status)) return 'In progress';
  return 'Not started';
}

function saStatusColor(comp) {
  const label = saStatusLabel(comp);
  if (label === 'Complete')    return '#16a34a';
  if (label === 'Submitted')   return '#7c3aed';
  if (label === 'In progress') return '#d97706';
  return '#94a3b8';
}

function SkillsAssessmentRow({ lesson }) {
  const comp = lesson.completion;
  const [detailOpen, setDetailOpen] = useState(false);
  const hasDetail = Array.isArray(comp?.rubric_detail) && comp.rubric_detail.length > 0;
  const statusLbl = saStatusLabel(comp);
  const statusClr = saStatusColor(comp);
  const isReviewed = !!(comp?.reviewed_at || isComplete(comp?.completion_status));

  return (
    <>
      <tr style={{ background: '#faf5ff' }}>
        <td style={{ padding: '6px 8px', fontSize: '0.8125rem', color: '#374151' }}>{lesson.name}</td>
        <td style={{ padding: '6px 8px' }}>
          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 600, background: `${statusClr}18`, color: statusClr, border: `1px solid ${statusClr}40`, whiteSpace: 'nowrap' }}>
            {statusLbl}
          </span>
        </td>
        <td style={{ padding: '6px 8px', fontSize: '0.8125rem', color: '#64748b' }}>
          {isReviewed && comp?.reviewed_at
            ? new Date(comp.reviewed_at).toLocaleDateString()
            : comp?.submitted_at
              ? new Date(comp.submitted_at).toLocaleDateString()
              : '—'}
        </td>
        <td style={{ padding: '6px 8px', fontSize: '0.8125rem', fontWeight: 600 }}>
          {isReviewed && comp?.rubric_score != null ? (
            <span style={{ color: comp.rubric_score >= 4 ? '#16a34a' : comp.rubric_score >= 3 ? '#d97706' : '#dc2626' }}>
              {(Math.round(comp.rubric_score * 10) / 10).toFixed(1)} / 5
            </span>
          ) : statusLbl === 'Submitted' ? (
            <span style={{ fontSize: '0.75rem', color: '#7c3aed' }}>Pending review</span>
          ) : '—'}
        </td>
        <td style={{ padding: '6px 8px' }}>
          {hasDetail && (
            <button
              type="button"
              onClick={() => setDetailOpen((o) => !o)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', color: '#2563eb', padding: 0 }}
            >
              {detailOpen ? 'Hide' : 'Details'}
            </button>
          )}
        </td>
      </tr>
      {detailOpen && hasDetail && (
        <tr>
          <td colSpan={5} style={{ padding: '0 8px 10px 24px', background: '#f5f3ff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '4px 6px', color: '#64748b', fontWeight: 600 }}>Criterion</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px', color: '#64748b', fontWeight: 600 }}>Rating</th>
                  <th style={{ textAlign: 'left', padding: '4px 6px', color: '#64748b', fontWeight: 600 }}>Feedback</th>
                </tr>
              </thead>
              <tbody>
                {comp.rubric_detail.map((d, i) => (
                  <tr key={i}>
                    <td style={{ padding: '3px 6px', color: '#374151' }}>{d.criterion_title}</td>
                    <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 600, color: d.criterion_rating >= 4 ? '#16a34a' : d.criterion_rating >= 3 ? '#d97706' : '#dc2626' }}>
                      {d.criterion_rating}
                    </td>
                    <td style={{ padding: '3px 6px', color: '#64748b', fontSize: '0.78rem' }}>{d.criterion_feedback || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

function CourseCard({ course }) {
  const [open, setOpen] = useState(false);
  const hasLessons = course.lessons?.length > 0;
  const hasAssessments = course.skills_assessments?.length > 0;
  const courseStatus = course.course_completion?.completion_status;
  const saCount = course.sa_count ?? 0;
  const saCompleted = course.sa_completed ?? 0;
  const saPct = saCount > 0 ? Math.round((saCompleted / saCount) * 100) : 0;

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', marginBottom: '12px' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          textAlign: 'left',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#1e293b' }}>{course.name}</span>
            {course.competency && (
              <span style={{ fontSize: '0.75rem', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '1px 6px', fontWeight: 500 }}>
                {course.competency}
              </span>
            )}
            <StatusBadge status={courseStatus} />
          </div>
          {/* Dual progress bars */}
          <div style={{ marginTop: '10px', display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {course.lesson_count > 0 && (
              <div style={{ flex: '1 1 200px', minWidth: '160px' }}>
                <ProgressBar pct={course.lesson_pct ?? 0} />
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                  {course.lessons_completed} / {course.lesson_count} lessons complete
                </div>
              </div>
            )}
            {saCount > 0 && (
              <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ minWidth: '120px' }}>
                  <ProgressBar pct={saPct} color={saPct === 100 ? '#16a34a' : saPct > 0 ? '#7c3aed' : '#e2e8f0'} />
                  <div style={{ fontSize: '0.72rem', color: '#7c3aed', marginTop: '2px' }}>
                    {saCompleted} / {saCount} assessments{course.sa_submitted > 0 ? ` · ${course.sa_submitted} pending` : ''}
                  </div>
                </div>
                <SAScoreBadge score={course.sa_avg_score} />
              </div>
            )}
          </div>
        </div>
        <span style={{ fontSize: '0.8125rem', color: '#94a3b8', flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid #f1f5f9' }}>
          {hasLessons && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Lessons
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ textAlign: 'left', padding: '4px 8px', color: '#64748b', fontWeight: 600 }}>Lesson</th>
                      <th style={{ textAlign: 'left', padding: '4px 8px', color: '#64748b', fontWeight: 600 }}>Status</th>
                      <th style={{ textAlign: 'left', padding: '4px 8px', color: '#64748b', fontWeight: 600 }}>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {course.lessons.map((l) => <LessonRow key={l.hs_lesson_id} lesson={l} />)}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {hasAssessments && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Skills Assessments
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ textAlign: 'left', padding: '4px 8px', color: '#64748b', fontWeight: 600 }}>Assessment</th>
                      <th style={{ textAlign: 'left', padding: '4px 8px', color: '#64748b', fontWeight: 600 }}>Status</th>
                      <th style={{ textAlign: 'left', padding: '4px 8px', color: '#64748b', fontWeight: 600 }}>Date</th>
                      <th style={{ textAlign: 'left', padding: '4px 8px', color: '#64748b', fontWeight: 600 }}>Score</th>
                      <th style={{ padding: '4px 8px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {course.skills_assessments.map((l) => <SkillsAssessmentRow key={l.hs_lesson_id} lesson={l} />)}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!hasLessons && !hasAssessments && (
            <div style={{ padding: '12px 0', fontSize: '0.875rem', color: '#94a3b8' }}>
              No lesson data synced for this course yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CourseCompletionPanel({ completions, loading, error }) {
  if (loading) {
    return (
      <div className="card section">
        <div className="card-header"><h2 className="card-title">Core Curriculum</h2></div>
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#64748b', fontSize: '0.875rem' }}>
          <div className="spinner" style={{ width: '16px', height: '16px' }} /> Loading course data…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card section">
        <div className="card-header"><h2 className="card-title">Core Curriculum</h2></div>
        <div className="card-body">
          <div className="alert alert-error">{error}</div>
        </div>
      </div>
    );
  }

  const courses = completions || [];

  if (courses.length === 0) {
    return (
      <div className="card section">
        <div className="card-header"><h2 className="card-title">Core Curriculum</h2></div>
        <div className="card-body">
          <div className="empty-state">
            <div className="empty-icon">📚</div>
            <div>No tracked courses configured. Ask your administrator to set up course reporting.</div>
          </div>
        </div>
      </div>
    );
  }

  const totalCourses = courses.length;
  const completedCourses = courses.filter((c) => isComplete(c.course_completion?.completion_status) && !isFailed(c.course_completion?.completion_status)).length;
  const inProgressCourses = courses.filter((c) => isInProgress(c.course_completion?.completion_status)).length;
  const avgLessonPct = courses.filter((c) => c.lesson_count > 0).reduce((s, c) => s + (c.lesson_pct ?? 0), 0) / (courses.filter((c) => c.lesson_count > 0).length || 1);
  const saScored = courses.filter((c) => c.sa_avg_score != null);
  const overallSaAvg = saScored.length > 0
    ? Math.round((saScored.reduce((s, c) => s + c.sa_avg_score, 0) / saScored.length) * 10) / 10
    : null;

  return (
    <div className="card section">
      <div className="card-header">
        <h2 className="card-title">Core Curriculum</h2>
        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{completedCourses}/{totalCourses} courses complete</span>
      </div>
      <div className="card-body">
        {/* Summary row */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '100px', padding: '12px 16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#16a34a' }}>{completedCourses}</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>Complete</div>
          </div>
          <div style={{ flex: 1, minWidth: '100px', padding: '12px 16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#d97706' }}>{inProgressCourses}</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>In progress</div>
          </div>
          <div style={{ flex: 1, minWidth: '100px', padding: '12px 16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#2563eb' }}>{Math.round(avgLessonPct)}%</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>Avg lessons done</div>
          </div>
          <div style={{ flex: 1, minWidth: '100px', padding: '12px 16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              {overallSaAvg != null ? (
                <SAScoreBadge score={overallSaAvg} />
              ) : (
                <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#7c3aed' }}>—</span>
              )}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>Avg SA score</div>
          </div>
        </div>

        {/* Per-course cards */}
        {courses.map((course) => <CourseCard key={course.hs_item_id} course={course} />)}
      </div>
    </div>
  );
}
