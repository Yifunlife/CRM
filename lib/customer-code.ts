// Business numbers come only from confirmed, active deals. Unconverted customers stay unnumbered.
export async function ensureCustomerCode(db:D1Database,lead:any,_desktopId=''){
 const rows=(await db.prepare('SELECT d.order_number FROM crm_deals d JOIN crm_leads l ON l.id=d.lead_id WHERE l.id=? AND l.owner_id=? AND d.cancelled=0 ORDER BY d.deal_date,d.created,d.id').bind(lead.id,lead.owner_id).all<{order_number:string}>()).results;
 return [...new Set(rows.map(row=>row.order_number.trim()).filter(Boolean))].join('、');
}
