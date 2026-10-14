import { Icon } from "./Icon";

export function ModalHeader({ title, subtitle, icon }: { title: string; subtitle: string; icon: string }) {
  return <header className="lifeos-modal-header"><span className="lifeos-modal-heading-icon"><Icon name={icon} /></span><div><h2>{title}</h2><p>{subtitle}</p></div></header>;
}
