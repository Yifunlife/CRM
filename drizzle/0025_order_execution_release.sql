-- Retain the financial release gate; approved free replacement orders carry their own saved approval.
DROP TRIGGER crm_workflow_ship_guard;
--> statement-breakpoint
CREATE TRIGGER crm_workflow_ship_guard BEFORE UPDATE ON crm_followup_orders
WHEN (json_extract(NEW.steps,'$[5].status')='已完成' AND json_extract(OLD.steps,'$[5].status') IS NOT '已完成')
 OR (json_extract(NEW.steps,'$[6].status')='已完成' AND json_extract(OLD.steps,'$[6].status') IS NOT '已完成')
 OR (COALESCE(json_extract(NEW.details,'$.dates.actual_ship.date'),'')<>'' AND json_extract(NEW.details,'$.dates.actual_ship.date') IS NOT json_extract(OLD.details,'$.dates.actual_ship.date'))
BEGIN
 SELECT CASE WHEN NOT (COALESCE(json_extract(NEW.details,'$.execution.profile.type'),'')='replacement' AND COALESCE(json_extract(NEW.details,'$.execution.profile.charge'),'')='free' AND COALESCE(json_extract(NEW.details,'$.contract_source.amount_minor'),-1)=0 AND COALESCE(json_extract(NEW.details,'$.contract_source.evidence'),'')<>'' AND COALESCE(json_extract(NEW.details,'$.execution.stages.release.status'),'')='已完成') AND NOT EXISTS(SELECT 1 FROM crm_workflow_releases r JOIN crm_workflow_contracts c ON c.deal_id=r.deal_id JOIN crm_deals d ON d.id=c.deal_id WHERE r.order_id=NEW.id AND r.deal_id=NEW.deal_id AND d.cancelled=0 AND r.contract_version=c.version) THEN RAISE(ABORT,'请先由管理员核实应收并确认发货放行；收款变化后须重新确认') END;
END;
