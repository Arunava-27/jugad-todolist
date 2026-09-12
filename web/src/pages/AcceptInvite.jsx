import { Logo } from '../components/Icon.jsx';

// Shown for a visitor holding an ?invite=<token> link. Branches on whether
// they're signed in yet and whether the signed-in identity matches the
// invite — actually joining happens via App.jsx's acceptPendingInvite,
// this just decides which prompt/action to show.
export default function AcceptInvite({ info, error, user, accepting, onSignIn, onRegister, onAcceptNow, onLogout, onDismiss }) {
  const roleLabel = info?.isStakeholder ? 'stakeholder' : info?.role;
  return (
    <div className="login-screen">
      <div className="login-card">
        <button type="button" className="login-brand" onClick={onDismiss} title="Back to Punchlist">
          <Logo size={26} /><h1>Punchlist</h1>
        </button>

        {error ? (
          <>
            <p className="login-sub">{error}</p>
            <button onClick={onDismiss}>Go to Punchlist</button>
          </>
        ) : !info ? (
          <p className="login-sub">Loading invite…</p>
        ) : user && user.email === info.email ? (
          <>
            <p className="login-sub">
              <strong>{info.inviterName}</strong> invited you to join <strong>{info.workspaceName}</strong> as
              a {roleLabel}.
            </p>
            {error && <div className="login-error">{error}</div>}
            <button onClick={onAcceptNow} disabled={accepting}>{accepting ? 'Joining…' : `Join ${info.workspaceName}`}</button>
          </>
        ) : user ? (
          <>
            <p className="login-sub">
              This invite was sent to <strong>{info.email}</strong>, but you're signed in as {user.email}.
              Log out to accept it with the right account.
            </p>
            <button onClick={onLogout}>Log out</button>
          </>
        ) : (
          <>
            <p className="login-sub">
              <strong>{info.inviterName}</strong> invited <strong>{info.email}</strong> to join{' '}
              <strong>{info.workspaceName}</strong> on Punchlist as a {roleLabel}.
            </p>
            {info.accountExists ? (
              <button onClick={onSignIn}>Sign in to accept</button>
            ) : (
              <button onClick={onRegister}>Create your account</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
