import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Hexagon adjacency list for win checking
const adjacencyList: Record<number, number[]> = {
    1: [2, 3], 2: [1, 3, 4, 5], 3: [1, 2, 5, 6], 4: [2, 5, 7, 8],
    5: [2, 3, 4, 6, 8, 9], 6: [3, 5, 9, 10], 7: [4, 8, 11, 12],
    8: [4, 5, 7, 9, 12, 13], 9: [5, 6, 8, 10, 13, 14], 10: [6, 9, 14, 15],
    11: [7, 12, 16, 17], 12: [7, 8, 11, 13, 17, 18], 13: [8, 9, 12, 14, 18, 19],
    14: [9, 10, 13, 15, 19, 20], 15: [10, 14, 20, 21], 16: [11, 17, 22, 23],
    17: [11, 12, 16, 18, 23, 24], 18: [12, 13, 17, 19, 24, 25],
    19: [13, 14, 18, 20, 25, 26], 20: [14, 15, 19, 21, 26, 27],
    21: [15, 20, 27, 28], 22: [16, 23], 23: [16, 17, 22, 24],
    24: [17, 18, 23, 25], 25: [18, 19, 24, 26], 26: [19, 20, 25, 27],
    27: [20, 21, 26, 28], 28: [21, 27]
};

const SIDES = {
    TOP: [1], BOTTOM: [22, 23, 24, 25, 26, 27, 28],
    LEFT: [2, 4, 7, 11, 16, 22], RIGHT: [3, 6, 10, 15, 21, 28]
};

const checkWin = (ownedNodes: number[], playerId: number) => {
    if (!ownedNodes || ownedNodes.length < 1) return false;
    const nodeSet = new Set(ownedNodes);
    const visited = new Set();
    const targetA = playerId === 1 ? SIDES.TOP : SIDES.LEFT;
    const targetB = playerId === 1 ? SIDES.BOTTOM : SIDES.RIGHT;

    for (const startNode of ownedNodes) {
        if (visited.has(startNode)) continue;
        const queue = [startNode];
        visited.add(startNode);
        let touchesA = false;
        let touchesB = false;

        while (queue.length > 0) {
            const curr = queue.shift()!;
            if (targetA.includes(curr)) touchesA = true;
            if (targetB.includes(curr)) touchesB = true;
            if (touchesA && touchesB) return true;
            const neighbors = adjacencyList[curr] || [];
            for (const neighbor of neighbors) {
                if (nodeSet.has(neighbor) && !visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }
    }
    return false;
};

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const adminClient = createClient(supabaseUrl, supabaseServiceKey);

        const authHeader = req.headers.get('Authorization') || '';
        const token = authHeader.replace('Bearer ', '');

        // Manual User Check because verify_jwt=false for Gateway stability
        const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
        if (authError || !user) {
            console.error("Auth Failure:", authError?.message);
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const { gameId, hexId, targetOwner, pointsEarned = 0, breakCombo = false } = await req.json();

        // Fetch current game state
        const { data: game, error: gameError } = await adminClient.from('games').select('*').eq('id', gameId).single();
        if (gameError || !game) throw new Error('Game not found');
        if (game.status !== 'active') throw new Error('Game is not active anymore');

        // Security: Check if player belongs to this game
        if (user.id !== game.player1_id && user.id !== game.player2_id) throw new Error('Unauthorized access to this game');

        const hex = game.board_state.find((h: any) => h.id === hexId);
        if (!hex) throw new Error('Hexagon not found in board state');

        // Points and Combo Logic
        let p1Score = game.p1_score || 0;
        let p2Score = game.p2_score || 0;
        let p1Combo = game.p1_combo || 0;
        let p2Combo = game.p2_combo || 0;
        const currentPlayerInt = game.current_turn === game.player1_id ? 1 : 2;

        if (targetOwner === 'player1') {
            p1Score += hex.special === 'double' ? pointsEarned * 2 : pointsEarned;
            p1Combo += 1;
        } else if (targetOwner === 'player2') {
            p2Score += hex.special === 'double' ? pointsEarned * 2 : pointsEarned;
            p2Combo += 1;
        } else if ((targetOwner === 'unowned' || targetOwner === 'black') && breakCombo) {
            if (currentPlayerInt === 1) {
                p1Combo = 0; if (hex.special === 'risk') p1Score = Math.max(0, p1Score - 15);
            } else {
                p2Combo = 0; if (hex.special === 'risk') p2Score = Math.max(0, p2Score - 15);
            }
        }

        // New Board State
        const newBoard = targetOwner !== 'unowned'
            ? game.board_state.map((h: any) => h.id === hexId && (h.owner === 'unowned' || h.owner === 'black') ? { ...h, owner: targetOwner } : h)
            : game.board_state;

        // Win Verification
        let winnerId = null;
        let gameStatus = 'active';

        if (game.game_type === 'points') {
            if (p1Score >= 150) winnerId = game.player1_id;
            else if (p2Score >= 150) winnerId = game.player2_id;
            else if (newBoard.every((h: any) => h.owner !== 'unowned' && h.owner !== 'black')) {
                winnerId = p1Score >= p2Score ? game.player1_id : game.player2_id;
            }
        } else {
            const p1Nodes = newBoard.filter((h: any) => h.owner === 'player1').map((h: any) => h.id);
            const p2Nodes = newBoard.filter((h: any) => h.owner === 'player2').map((h: any) => h.id);
            if (checkWin(p1Nodes, 1)) winnerId = game.player1_id;
            else if (checkWin(p2Nodes, 2)) winnerId = game.player2_id;
        }

        if (winnerId) gameStatus = 'finished';

        // Swap Turn
        const nextTurnId = game.current_turn === game.player1_id ? game.player2_id : game.player1_id;

        // Atomic Update
        const { error: updateError } = await adminClient.from('games').update({
            board_state: newBoard,
            current_turn: nextTurnId,
            p1_score: p1Score, p2_score: p2Score,
            p1_combo: p1Combo, p2_combo: p2Combo,
            active_modal: null,
            status: gameStatus,
            winner_id: winnerId,
            updated_at: new Date().toISOString()
        }).eq('id', game.id);

        if (updateError) throw updateError;

        return new Response(JSON.stringify({ success: true, winnerId }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
        });

    } catch (err) {
        console.error("Move processing failed:", err.message);
        return new Response(JSON.stringify({ error: err.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
        });
    }
})
