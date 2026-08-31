import { supabase } from './supabaseClient';

// Shared by JobDetail's "Add event" flow and the Gmail inbox review queue's
// "Confirm" flow — both need to insert an event and derive the same
// resulting job status/field updates from it.
export async function addJobEvent(jobId, eventInput) {
  const {
    expected_response_date,
    application_method: newApplicationMethod,
    ...eventFields
  } = eventInput;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Not signed in.' };

  const { data: event, error: insertError } = await supabase
    .from('events')
    .insert({
      job_id: jobId,
      user_id: user.id,
      ...eventFields,
    })
    .select(
      'id, event_name, event_type, event_date, event_time, location, created_at',
    )
    .single();

  if (insertError) return { error: insertError.message };

  const now = new Date().toISOString();

  const jobUpdates = {
    status: eventInput.event_name,
    status_updated_at: now,
    updated_at: now,
  };

  if (eventInput.event_name === 'Application acknowledged') {
    jobUpdates.expected_response_date = expected_response_date || null;
  }

  if (eventInput.event_name === 'Applied') {
    jobUpdates.application_method = newApplicationMethod || null;
  }

  if (eventInput.event_name === 'Unsuccessful') {
    jobUpdates.is_closed = true;
  }

  const { error: statusError } = await supabase
    .from('jobs')
    .update(jobUpdates)
    .eq('id', jobId);

  if (statusError) return { error: statusError.message };

  return { event, jobUpdates, applicationMethod: newApplicationMethod };
}
