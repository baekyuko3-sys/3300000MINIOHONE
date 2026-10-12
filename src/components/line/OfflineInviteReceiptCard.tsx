import { useMemo, type MouseEvent } from 'react';

export type OfflineInviteReceiptTheme = 'white' | 'midnight' | 'parchment' | 'rose';

type OfflineInviteReceiptCardProps = {
  msg: {
    id: number | string;
    inviteFrom?: 'me' | 'other' | string;
    inviteLocation?: string;
    inviteTime?: string;
    inviteTheme?: string;
    invitePreview?: string;
    inviteLetter?: string;
    inviteStatus?: 'pending' | 'accepted' | 'declined' | string;
  };
  theme?: OfflineInviteReceiptTheme;
  characterName: string;
  characterAvatar?: string;
  userName?: string;
  userAvatar?: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
  onContextMenu?: (e: MouseEvent) => void;
};

/** 小票上的一句话预览：优先用角色写的 preview */
function resolvePreview(preview: string, letter: string): string {
  const direct = String(preview || '').replace(/\s+/g, ' ').trim();
  if (direct) return direct.length > 18 ? `${direct.slice(0, 18)}…` : direct;
  const cleaned = String(letter || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '……';
  const first = cleaned.split(/[。！？\n]/).find(Boolean)?.trim() || cleaned;
  return first.length > 16 ? `${first.slice(0, 16)}…` : first;
}

function invitationCode(id: number | string): string {
  const digits = String(id).replace(/\D/g, '');
  const tail = (digits || '1').slice(-4).padStart(4, '0');
  return `OFFLINE INVITATION · ${tail}`;
}

export function OfflineInviteReceiptCard({
  msg,
  theme = 'white',
  characterName,
  userName = '我',
  expanded,
  onToggleExpand,
  onAccept,
  onDecline,
  onContextMenu,
}: OfflineInviteReceiptCardProps) {
  const fromOther = msg.inviteFrom !== 'me';
  const displayName = fromOther ? characterName : userName;
  // 邀约标题：例「要不要和我一起去看看？」
  const title = (msg.inviteTheme || '').trim() || '要不要和我一起去看看？';
  const place = (msg.inviteLocation || '').trim() || '待定';
  const date = (msg.inviteTime || '').trim() || '待定';
  const letter = (msg.inviteLetter || '').trim();
  const preview = useMemo(
    () => resolvePreview(msg.invitePreview || '', letter),
    [msg.invitePreview, letter],
  );
  const code = useMemo(() => invitationCode(msg.id), [msg.id]);
  const status = msg.inviteStatus || 'pending';

  return (
    <div
      className={`line-receipt-invite line-receipt-invite--${theme} custom-invite-card select-text ${expanded ? 'is-expanded' : ''}`}
      onContextMenu={onContextMenu}
    >
      {!expanded ? (
        <button
          type="button"
          className="line-receipt-invite__receipt"
          onClick={onToggleExpand}
          aria-label="打开邀约函"
        >
          <div className="line-receipt-invite__serration line-receipt-invite__serration--top" aria-hidden />
          <div className="line-receipt-invite__body">
            {/* OFFLINE INVITATION · 0001 */}
            <div className="line-receipt-invite__code">{code}</div>

            {/* [角色名] */}
            <div className="line-receipt-invite__name">{displayName}</div>

            {/* [邀约标题] 例：要不要和我一起去看看？ */}
            <div className="line-receipt-invite__title">{title}</div>

            {/* [一句话预览] 角色想对你说的一句话，短一点 */}
            <div className="line-receipt-invite__preview">{preview}</div>

            <div className="line-receipt-invite__divider" />

            <div className="line-receipt-invite__info">
              <div>
                <div className="line-receipt-invite__info-label">DATE</div>
                <div className="line-receipt-invite__info-value">{date}</div>
              </div>
              <div className="line-receipt-invite__info-right">
                <div className="line-receipt-invite__info-label">PLACE</div>
                <div className="line-receipt-invite__info-value">{place}</div>
              </div>
            </div>

            <div className="line-receipt-invite__open">OPEN INVITATION</div>
          </div>
          <div className="line-receipt-invite__serration line-receipt-invite__serration--bottom" aria-hidden />
        </button>
      ) : (
        <div className="line-receipt-invite__letter">
          <button
            type="button"
            className="line-receipt-invite__close"
            onClick={onToggleExpand}
            aria-label="收起邀约函"
          >
            ×
          </button>

          <div className="line-receipt-invite__letter-head">
            <div className="line-receipt-invite__small-title">A LETTER FOR YOU</div>
            <div className="line-receipt-invite__letter-title">{title}</div>
          </div>

          <div className="line-receipt-invite__message">
            {letter || '（尚未填写邀请正文）'}
          </div>

          <div className="line-receipt-invite__details">
            <div>
              TIME : <span>{date}</span>
            </div>
            <div>
              PLACE : <span>{place}</span>
            </div>
            <div>
              FROM : <span>{displayName}</span>
            </div>
          </div>

          <div className="line-receipt-invite__actions">
            {status === 'accepted' ? (
              <div className="line-receipt-invite__status line-receipt-invite__status--ok">
                已欣然赴约，静候碰面
              </div>
            ) : status === 'declined' ? (
              <div className="line-receipt-invite__status">已暂缓本次邀约</div>
            ) : fromOther ? (
              <div className="line-receipt-invite__btn-row">
                <button
                  type="button"
                  className="line-receipt-invite__accept"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAccept?.();
                  }}
                >
                  赴约
                </button>
                <button
                  type="button"
                  className="line-receipt-invite__later"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDecline?.();
                  }}
                >
                  改天再约
                </button>
              </div>
            ) : (
              <div className="line-receipt-invite__status">等待对方确认赴约中…</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
