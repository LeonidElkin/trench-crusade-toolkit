import { articlesById } from '../data/content'
import { CostView, Modal, RuleLink, Source } from './Common'
import { Markdown } from './Markdown'
import { catalog } from '../data/registry'
import { UnitPortrait } from './UnitPortrait'
import { ruleBody, unitArticle } from '../data/article-format'
import type { Offer } from '../domain/schema'
import { UnitLore, UnitProfileStats, UnitQuantity } from './UnitDetails'
export function RulePreview({ id, offer, onClose }: { id: string; offer?: Offer; onClose: () => void }) {
  const source = articlesById.get(id)
  const a = source?.canonicalRuleId ? articlesById.get(source.canonicalRuleId) : source
  const item = offer && catalog.items.find((entry) => entry.id === offer.itemId)
  const profiles = catalog.units.filter((u) => u.ruleId === a?.id)
  const profile = profiles.length === 1 ? profiles[0] : undefined
  return (
    <Modal title={offer?.name ?? a?.title ?? 'Правило не найдено'} wide onClose={onClose}>
      {a && (
        <>
          <Source source={a} />
          {offer && (
            <p className="preview-offer">
              <CostView cost={offer.cost} compact />
              {offer.limit !== null && <strong>Лимит: {offer.limit}</strong>}
              {offer.notes && <span className="small muted">{offer.notes}</span>}
            </p>
          )}
          {profile && (
            <UnitPortrait
              editionId={catalog.edition}
              unitId={profile.id}
              name={profile.name}
              className="preview-portrait"
            />
          )}
          {profile && <><UnitQuantity unit={profile} /><UnitProfileStats unit={profile} /></>}
          {item?.unresolved
            ? <p className="muted">В источнике есть предложение арсенала. Отдельный профиль предмета требует сверки.</p>
            : <Markdown content={profile ? unitArticle(a.markdown).body : ruleBody(a.id, a.markdown)} currentId={a.id} minimumHeadingLevel={3} />}
          {profile && <UnitLore unit={profile} />}
          <RuleLink id={a.id} onClick={onClose}>
            Открыть в справочнике
          </RuleLink>
        </>
      )}
    </Modal>
  )
}
