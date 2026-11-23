// The public roadmap has exactly four statuses (four board columns).
// "Merged" is NOT a status: a merged request leaves the board and points to its canonical request.
const STATUSES = ['under_review', 'planned', 'in_progress', 'shipped'];

const LABELS = { under_review: 'Under Review', planned: 'Planned', in_progress: 'In Progress', shipped: 'Shipped' };

// Allowed moves (admin only). Anything else -> 409 INVALID_TRANSITION.
const TRANSITIONS = {
  under_review: ['planned'],
  planned: ['in_progress', 'under_review'],
  in_progress: ['shipped', 'planned'],
  shipped: [] // released: final
};

const canMove = (from, to) => (TRANSITIONS[from] || []).includes(to);

module.exports = { STATUSES, LABELS, TRANSITIONS, canMove };
