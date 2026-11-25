export type Status = 'present' | 'present_voting' | 'absent'
export interface Delegate { id: string; display_name: string; country: string }
export interface Speaker {
  session_id: string
  id: string; delegate_id: string; position: number; duration_seconds: number
  elapsed_ms: number; running_since: string | null; finished_at: string | null
  list: 'gsl' | 'mod' | 'single'; motion_id: string | null
  yielded_to: 'chair' | 'questions' | 'delegate' | null; yielded_from: string | null
}
export type MotionKind = 'mod' | 'unmod' | 'single' | 'close_debate' | 'suspend' | 'adjourn' | 'other'
export interface Motion {
  id: string; session_id: string; kind: MotionKind; title: string | null; delegate_id: string | null
  total_seconds: number | null; speaker_seconds: number | null
  status: 'pending' | 'passed' | 'failed' | 'active' | 'done'
  elapsed_ms: number; running_since: string | null; created_at: string
}
export interface Vote {
  id: string; session_id: string; motion_id: string | null; title: string
  majority: 'simple' | 'two_thirds'; status: 'open' | 'closed'; result: 'passed' | 'failed' | null; created_at: string
}
export interface Ballot { vote_id: string; delegate_id: string; choice: 'yes' | 'no' | 'abstain' }
