import { useEffect, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { formatCvDateRange } from '../jobFormat';
import ConfirmDialog from '../components/ConfirmDialog';
import ExperienceDialog from '../components/ExperienceDialog';
import EducationDialog from '../components/EducationDialog';
import CertificationDialog from '../components/CertificationDialog';
import CustomSectionDialog from '../components/CustomSectionDialog';

function experienceSortKey(exp) {
  if (exp.is_current) return Infinity;
  if (exp.end_year) return exp.end_year * 12 + (exp.end_month || 12);
  return exp.start_year * 12 + (exp.start_month || 1);
}

function CvComponents() {
  const navigate = useNavigate();
  const { country } = useOutletContext();
  const cvWord = country === 'US' ? 'resume' : 'CV';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [cvSummary, setCvSummary] = useState('');
  const [savingSummary, setSavingSummary] = useState(false);

  const [skills, setSkills] = useState([]);
  const [newSkillText, setNewSkillText] = useState('');
  const [addingSkill, setAddingSkill] = useState(false);

  const [experiences, setExperiences] = useState([]);
  const [experienceDialogOpen, setExperienceDialogOpen] = useState(false);
  const [editingExperience, setEditingExperience] = useState(null);
  const [experienceDeletePending, setExperienceDeletePending] = useState(null);

  const [educations, setEducations] = useState([]);
  const [educationDialogOpen, setEducationDialogOpen] = useState(false);
  const [editingEducation, setEditingEducation] = useState(null);
  const [educationDeletePending, setEducationDeletePending] = useState(null);

  const [certifications, setCertifications] = useState([]);
  const [certificationDialogOpen, setCertificationDialogOpen] = useState(false);
  const [editingCertification, setEditingCertification] = useState(null);
  const [certificationDeletePending, setCertificationDeletePending] = useState(null);

  const [customSections, setCustomSections] = useState([]);
  const [customSectionDialogOpen, setCustomSectionDialogOpen] = useState(false);
  const [editingCustomSection, setEditingCustomSection] = useState(null);
  const [customSectionDeletePending, setCustomSectionDeletePending] =
    useState(null);

  const experienceSectionRef = useRef(null);
  const educationSectionRef = useRef(null);
  const certificationSectionRef = useRef(null);
  const customSectionSectionRef = useRef(null);

  // `silent` skips the full-page loading state — used when refetching after
  // a dialog save, so the page doesn't briefly unmount to "Loading…" and
  // lose the user's scroll position (which otherwise snaps back to the top).
  async function loadAll({ silent = false } = {}) {
    if (!silent) setLoading(true);
    setError(null);

    const [
      profileResult,
      skillsResult,
      experienceResult,
      educationResult,
      certificationResult,
      sectionsResult,
    ] = await Promise.all([
      supabase.from('profiles').select('cv_summary').maybeSingle(),
      supabase
        .from('cv_skills')
        .select('id, skill_text')
        .order('created_at', { ascending: true }),
      supabase
        .from('cv_experience')
        .select(
          'id, job_title, employer, location, start_year, start_month, end_year, end_month, is_current',
        ),
      supabase
        .from('cv_education')
        .select('id, establishment, level, subject, grade, qualification_year'),
      supabase
        .from('cv_certifications')
        .select(
          'id, issuer, title, location, start_year, start_month, end_year, end_month, is_current',
        ),
      supabase
        .from('cv_custom_sections')
        .select('id, heading, content, format, intro_text')
        .order('sort_order', { ascending: true }),
    ]);

    if (profileResult.error) setError(profileResult.error.message);
    else setCvSummary(profileResult.data?.cv_summary ?? '');

    if (skillsResult.error) setError(skillsResult.error.message);
    else setSkills(skillsResult.data ?? []);

    if (experienceResult.error) {
      setError(experienceResult.error.message);
    } else {
      setExperiences(
        [...(experienceResult.data ?? [])].sort(
          (a, b) => experienceSortKey(b) - experienceSortKey(a),
        ),
      );
    }

    if (educationResult.error) {
      setError(educationResult.error.message);
    } else {
      setEducations(
        [...(educationResult.data ?? [])].sort(
          (a, b) => (b.qualification_year ?? 0) - (a.qualification_year ?? 0),
        ),
      );
    }

    if (certificationResult.error) {
      setError(certificationResult.error.message);
    } else {
      setCertifications(
        [...(certificationResult.data ?? [])].sort(
          (a, b) => experienceSortKey(b) - experienceSortKey(a),
        ),
      );
    }

    if (sectionsResult.error) setError(sectionsResult.error.message);
    else setCustomSections(sectionsResult.data ?? []);

    if (!silent) setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleSaveSummary() {
    setSavingSummary(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError('Not signed in.');
      setSavingSummary(false);
      return;
    }

    const { error: saveError } = await supabase
      .from('profiles')
      .update({ cv_summary: cvSummary })
      .eq('id', user.id);

    setSavingSummary(false);
    if (saveError) setError(saveError.message);
  }

  async function handleAddSkill(e) {
    e.preventDefault();
    if (!newSkillText.trim()) return;

    setAddingSkill(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError('Not signed in.');
      setAddingSkill(false);
      return;
    }

    const { data, error: insertError } = await supabase
      .from('cv_skills')
      .insert({ user_id: user.id, skill_text: newSkillText.trim() })
      .select('id, skill_text')
      .single();

    setAddingSkill(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setSkills((s) => [...s, data]);
    setNewSkillText('');
  }

  async function handleDeleteSkill(skill) {
    setError(null);
    const { error: deleteError } = await supabase
      .from('cv_skills')
      .delete()
      .eq('id', skill.id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setSkills((s) => s.filter((sk) => sk.id !== skill.id));
  }

  async function handleConfirmDeleteExperience() {
    const exp = experienceDeletePending;
    if (!exp) return;

    setError(null);
    const { error: deleteError } = await supabase
      .from('cv_experience')
      .delete()
      .eq('id', exp.id);

    setExperienceDeletePending(null);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setExperiences((exps) => exps.filter((e) => e.id !== exp.id));
  }

  async function handleConfirmDeleteEducation() {
    const edu = educationDeletePending;
    if (!edu) return;

    setError(null);
    const { error: deleteError } = await supabase
      .from('cv_education')
      .delete()
      .eq('id', edu.id);

    setEducationDeletePending(null);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setEducations((edus) => edus.filter((e) => e.id !== edu.id));
  }

  async function handleConfirmDeleteCertification() {
    const cert = certificationDeletePending;
    if (!cert) return;

    setError(null);
    const { error: deleteError } = await supabase
      .from('cv_certifications')
      .delete()
      .eq('id', cert.id);

    setCertificationDeletePending(null);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setCertifications((certs) => certs.filter((c) => c.id !== cert.id));
  }

  async function handleConfirmDeleteCustomSection() {
    const section = customSectionDeletePending;
    if (!section) return;

    setError(null);
    const { error: deleteError } = await supabase
      .from('cv_custom_sections')
      .delete()
      .eq('id', section.id);

    setCustomSectionDeletePending(null);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setCustomSections((secs) => secs.filter((s) => s.id !== section.id));
  }

  if (loading) {
    return (
      <div className="list-page">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="list-page">
      <div className="list-header">
        <h1>Manage {cvWord} components</h1>
      </div>

      <p className="field-hint cv-components-intro">
        Build up a library of skills, experience, education, certifications
        and custom sections here. Building a {cvWord} for a specific job
        selects and arranges from whatever's relevant — not everything has
        to be used every time.
      </p>

      {error && <p className="form-error">{error}</p>}

      <section className="settings-section cv-component-section">
        <h2>Profile summary</h2>
        <textarea
          className="cv-summary-textarea"
          rows={8}
          value={cvSummary}
          onChange={(e) => setCvSummary(e.target.value)}
          placeholder="A short paragraph summarizing your experience and strengths — this is the seed a build tailors per job, not overwritten automatically."
        />
        <div className="cv-section-actions">
          <button
            type="button"
            className="button-outline"
            onClick={handleSaveSummary}
            disabled={savingSummary}
          >
            {savingSummary ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>

      <section className="settings-section cv-component-section">
        <h2>Skills</h2>
        <form className="cv-skill-add-form" onSubmit={handleAddSkill}>
          <input
            type="text"
            placeholder="e.g. Root-cause analysis"
            value={newSkillText}
            onChange={(e) => setNewSkillText(e.target.value)}
          />
          <button
            type="submit"
            className="button-outline"
            disabled={addingSkill || !newSkillText.trim()}
          >
            Add
          </button>
        </form>
        {skills.length === 0 ? (
          <p className="empty-list-hint">No skills added yet.</p>
        ) : (
          <ul className="skill-chip-list">
            {skills.map((skill) => (
              <li key={skill.id} className="skill-chip">
                {skill.skill_text}
                <button
                  type="button"
                  onClick={() => handleDeleteSkill(skill)}
                  aria-label={`Remove ${skill.skill_text}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="settings-section cv-component-section"
        ref={experienceSectionRef}
      >
        <h2>Experience</h2>
        {experiences.length === 0 ? (
          <p className="empty-list-hint">No experience added yet.</p>
        ) : (
          <ul className="item-list">
            {experiences.map((exp) => (
              <li key={exp.id} className="item-row">
                <span className="item-name">
                  <span className="item-name-primary">
                    {exp.job_title} — {exp.employer}
                  </span>
                  <span className="item-subtext">
                    {formatCvDateRange(exp)}
                  </span>
                </span>
                <div className="item-actions">
                  <button
                    type="button"
                    className="button-outline"
                    onClick={() => {
                      setEditingExperience(exp);
                      setExperienceDialogOpen(true);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="button-outline item-delete"
                    onClick={() => setExperienceDeletePending(exp)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="cv-section-actions">
          <button
            type="button"
            className="button-outline"
            onClick={() => {
              setEditingExperience(null);
              setExperienceDialogOpen(true);
            }}
          >
            Add experience
          </button>
        </div>
      </section>

      <section
        className="settings-section cv-component-section"
        ref={educationSectionRef}
      >
        <h2>Education</h2>
        {educations.length === 0 ? (
          <p className="empty-list-hint">No education added yet.</p>
        ) : (
          <ul className="item-list">
            {educations.map((edu) => (
              <li key={edu.id} className="item-row">
                <span className="item-name">
                  <span className="item-name-primary">
                    {edu.level}
                    {edu.subject ? ` — ${edu.subject}` : ''} — {edu.establishment}
                  </span>
                  <span className="item-subtext">
                    {edu.qualification_year}
                    {edu.grade ? ` · ${edu.grade}` : ''}
                  </span>
                </span>
                <div className="item-actions">
                  <button
                    type="button"
                    className="button-outline"
                    onClick={() => {
                      setEditingEducation(edu);
                      setEducationDialogOpen(true);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="button-outline item-delete"
                    onClick={() => setEducationDeletePending(edu)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="cv-section-actions">
          <button
            type="button"
            className="button-outline"
            onClick={() => {
              setEditingEducation(null);
              setEducationDialogOpen(true);
            }}
          >
            Add education
          </button>
        </div>
      </section>

      <section
        className="settings-section cv-component-section"
        ref={certificationSectionRef}
      >
        <h2>Certifications</h2>
        {certifications.length === 0 ? (
          <p className="empty-list-hint">No certifications added yet.</p>
        ) : (
          <ul className="item-list">
            {certifications.map((cert) => (
              <li key={cert.id} className="item-row">
                <span className="item-name">
                  <span className="item-name-primary">
                    {cert.title} — {cert.issuer}
                  </span>
                  <span className="item-subtext">
                    {formatCvDateRange(cert)}
                  </span>
                </span>
                <div className="item-actions">
                  <button
                    type="button"
                    className="button-outline"
                    onClick={() => {
                      setEditingCertification(cert);
                      setCertificationDialogOpen(true);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="button-outline item-delete"
                    onClick={() => setCertificationDeletePending(cert)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="cv-section-actions">
          <button
            type="button"
            className="button-outline"
            onClick={() => {
              setEditingCertification(null);
              setCertificationDialogOpen(true);
            }}
          >
            Add certification
          </button>
        </div>
      </section>

      <section
        className="settings-section cv-component-section"
        ref={customSectionSectionRef}
      >
        <h2>Custom sections</h2>
        {customSections.length === 0 ? (
          <p className="empty-list-hint">No custom sections added yet.</p>
        ) : (
          <ul className="item-list">
            {customSections.map((section) => (
              <li key={section.id} className="item-row">
                <span className="item-name">
                  <span className="item-name-primary">{section.heading}</span>
                  <span className="item-subtext">
                    {section.format === 'bullets' ? 'Bullet list' : 'Paragraph'}
                  </span>
                </span>
                <div className="item-actions">
                  <button
                    type="button"
                    className="button-outline"
                    onClick={() => {
                      setEditingCustomSection(section);
                      setCustomSectionDialogOpen(true);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="button-outline item-delete"
                    onClick={() => setCustomSectionDeletePending(section)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="cv-section-actions">
          <button
            type="button"
            className="button-outline"
            onClick={() => {
              setEditingCustomSection(null);
              setCustomSectionDialogOpen(true);
            }}
          >
            Add section
          </button>
        </div>
      </section>

      <button
        type="button"
        className="button-outline"
        onClick={() => navigate('/main')}
      >
        Back to home
      </button>

      <ExperienceDialog
        open={experienceDialogOpen}
        onClose={() => setExperienceDialogOpen(false)}
        experience={editingExperience}
        onSaved={() => {
          setExperienceDialogOpen(false);
          loadAll({ silent: true }).then(() => {
            experienceSectionRef.current?.scrollIntoView({ block: 'start' });
          });
        }}
      />

      <EducationDialog
        open={educationDialogOpen}
        onClose={() => setEducationDialogOpen(false)}
        education={editingEducation}
        onSaved={() => {
          setEducationDialogOpen(false);
          loadAll({ silent: true }).then(() => {
            educationSectionRef.current?.scrollIntoView({ block: 'start' });
          });
        }}
      />

      <CertificationDialog
        open={certificationDialogOpen}
        onClose={() => setCertificationDialogOpen(false)}
        certification={editingCertification}
        onSaved={() => {
          setCertificationDialogOpen(false);
          loadAll({ silent: true }).then(() => {
            certificationSectionRef.current?.scrollIntoView({ block: 'start' });
          });
        }}
      />

      <CustomSectionDialog
        open={customSectionDialogOpen}
        onClose={() => setCustomSectionDialogOpen(false)}
        section={editingCustomSection}
        onSaved={() => {
          setCustomSectionDialogOpen(false);
          loadAll({ silent: true }).then(() => {
            customSectionSectionRef.current?.scrollIntoView({ block: 'start' });
          });
        }}
      />

      <ConfirmDialog
        open={!!experienceDeletePending}
        title="Delete this experience entry?"
        message={`Delete "${experienceDeletePending?.job_title} — ${experienceDeletePending?.employer}"? This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDeleteExperience}
        onCancel={() => setExperienceDeletePending(null)}
      />

      <ConfirmDialog
        open={!!educationDeletePending}
        title="Delete this education entry?"
        message={`Delete "${educationDeletePending?.level} — ${educationDeletePending?.establishment}"? This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDeleteEducation}
        onCancel={() => setEducationDeletePending(null)}
      />

      <ConfirmDialog
        open={!!certificationDeletePending}
        title="Delete this certification?"
        message={`Delete "${certificationDeletePending?.title} — ${certificationDeletePending?.issuer}"? This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDeleteCertification}
        onCancel={() => setCertificationDeletePending(null)}
      />

      <ConfirmDialog
        open={!!customSectionDeletePending}
        title="Delete this section?"
        message={`Delete "${customSectionDeletePending?.heading}"? This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDeleteCustomSection}
        onCancel={() => setCustomSectionDeletePending(null)}
      />
    </div>
  );
}

export default CvComponents;
