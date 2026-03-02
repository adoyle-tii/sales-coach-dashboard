import { useState } from 'react';

/**
 * CourseCompletionPanel
 *
 * Props:
 *   completions  — array returned from GET /hs/completion/:userId  (courses[])
 *   loading      — boolean
 *   error        — string | null
 */

function statusColor(status) {
  const s = (status || '').toLowerCase();
  if (s === 'complete') return '#16a34a';
  if (s === 'in_progress') return '#d97706';
  return '#94a3b8';
}

function statusLabel(status) {
  const s = (status || '').toLowerCase();
  if (s === 'complete') return 'Complete';
  if (s === 'in_progress') return 'In progress';
  if (s === 'submitted') return 'Submitted';
  if (s === 'reviewed') return 'Reviewed';
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

function ProgressBar({ pct }) {
  const safe = Math.min(100, Math.max(0, pct ?? 0));
  const color = safe === 100 ? '#16a34a' : safe > 0 ? '#2563eb' : '#e2e8f0';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: '#e2e8f0', overflow: 'hidden' }}>
        <div style={{ width: `${safe}%`, height: '100%', borderRadius: '4px', background: color, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', minWidth: '32px', textAlign: 'right' }}>{safe}%</span>
    </div>
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

function SkillsAssessmentRow({ lesson }) {
  const comp = lesson.completion;
  const [detailOpen, setDetailOpen] = useState(false);
  const hasDetail = Array.isArray(comp?.rubric_detail) && comp.rubric_detail.length > 0;
  return (
    <>
      <tr style={{ background: '#fafafa' }}>
        <td style={{ padding: '6px 8px', fontSize: '0.8125rem', color: '#374151' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {lesson.name}
            <span style={{ fontSize: '0.7rem', background: '#7c3aed18', color: '#7c3aed', border: '1px solid #7c3aed30', borderRadius: '4px', padding: '1px 5px', fontWeight: 600 }}>
              Skills Assessment
            </span>
          </div>
        </td>
        <td style={{ padding: '6px 8px' }}>
          {comp ? <StatusBadge status={comp.completion_status || (comp.reviewed_at ? 'reviewed' : comp.submitted_at ? 'submitted' : 'not_started')} /> : <StatusBadge status={null} />}
        </td>
        <td style={{ padding: '6px 8px', fontSize: '0.8125rem', color: '#64748b' }}>
          {comp?.reviewed_at ? new Date(comp.reviewed_at).toLocaleDateString() : (comp?.submitted_at ? new Date(comp.submitted_at).toLocaleDateString() : '—')}
        </td>
        <td style={{ padding: '6px 8px' }}>
          <ScoreChip score={comp?.rubric_score} />
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
          <td colSpan={5} style={{ padding: '0 8px 10px 24px', background: '#f8fafc' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '4px 6px', color: '#64748b', fontWeight: 600 }}>Criterion</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px', color: '#64748b', fontWeight: 600 }}>Rating</th>
                </tr>
              </thead>
              <tbody>
                {comp.rubric_detail.map((d, i) => (
                  <tr key={i}>
                    <td style={{ padding: '3px 6px', color: '#374151' }}>{d.criterion_title}</td>
                    <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 600, color: d.criterion_rating >= 4 ? '#16a34a' : d.criterion_rating >= 3 ? '#d97706' : '#dc2626' }}>
                      {d.criterion_rating}
                    </td>
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
          {course.lesson_count > 0 && (
            <div style={{ marginTop: '8px', maxWidth: '400px' }}>
              <ProgressBar pct={course.lesson_pct ?? 0} />
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                {course.lessons_completed} / {course.lesson_count} lessons complete
              </div>
            </div>
          )}
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
  const completedCourses = courses.filter((c) => (c.course_completion?.completion_status || '').toLowerCase() === 'complete').length;
  const inProgressCourses = courses.filter((c) => (c.course_completion?.completion_status || '').toLowerCase() === 'in_progress').length;
  const avgLessonPct = courses.filter((c) => c.lesson_count > 0).reduce((s, c) => s + (c.lesson_pct ?? 0), 0) / (courses.filter((c) => c.lesson_count > 0).length || 1);

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
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#7c3aed' }}>{totalCourses - completedCourses - inProgressCourses}</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>Not started</div>
          </div>
        </div>

        {/* Per-course cards */}
        {courses.map((course) => <CourseCard key={course.hs_item_id} course={course} />)}
      </div>
    </div>
  );
}
