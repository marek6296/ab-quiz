import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';

export const AuthTabs = ({ onLoginSuccess }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);

    const handleAuth = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);

        try {
            if (isLogin) {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                onLoginSuccess && onLoginSuccess();
            } else {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            username: username,
                        }
                    }
                });
                if (error) throw error;
                setMessage('Registrácia úspešná! Skontroluj si email, alebo sa prihlás, ak si administrátor vypol emailové overenie.');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <h2>{isLogin ? 'Prihlásenie' : 'Registrácia'}</h2>

            {error && <div className="auth-error">{error}</div>}
            {message && <div className="auth-success">{message}</div>}

            <form onSubmit={handleAuth} className="auth-form">
                {!isLogin && (
                    <div className="form-group">
                        <label>Užívateľské meno</label>
                        <input
                            type="text"
                            placeholder="Zadaj prezývku"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required={!isLogin}
                        />
                    </div>
                )}
                <div className="form-group">
                    <label>Emailová adresa</label>
                    <input
                        type="email"
                        placeholder="napr. hrac@email.sk"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>
                <div className="form-group">
                    <label>Heslo</label>
                    <input
                        type="password"
                        placeholder="Minimálne 6 znakov"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>
                <button type="submit" disabled={loading} className="primary" style={{ marginTop: '0.5rem' }}>
                    {loading ? 'Spracovávam...' : (isLogin ? 'Prihlásiť sa' : 'Zaregistrovať sa')}
                </button>
            </form>

            <div className="auth-toggle">
                <button type="button" className="text-button" onClick={() => setIsLogin(!isLogin)}>
                    {isLogin ? 'Ešte nemáš účet? Zaregistruj sa kliknutím sem.' : 'Už máš účet? Prihlás sa kliknutím sem.'}
                </button>
            </div>
        </div>
    );
};
