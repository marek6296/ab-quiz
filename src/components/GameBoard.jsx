import React from 'react';

export const GameBoard = ({ board, onHexClick }) => {
    const rows = [
        [1],
        [2, 3],
        [4, 5, 6],
        [7, 8, 9, 10],
        [11, 12, 13, 14, 15],
        [16, 17, 18, 19, 20, 21],
        [22, 23, 24, 25, 26, 27, 28]
    ];

    return (
        <div className="board">
            {rows.map((row, index) => (
                <div className="hex-row" key={`row-${index}`}>
                    {row.map(hexId => {
                        const hexData = board.find(h => h.id === hexId);
                        return (
                            <div
                                key={hexId}
                                className={`hexagon ${hexData.owner !== 'unowned' ? hexData.owner : ''} ${hexData.owner === 'unowned' && hexData.special !== 'normal' ? `special-${hexData.special}` : ''}`}
                                onClick={() => onHexClick(hexId)}
                            >
                                <span className="hex-number">{hexId}</span>
                                {hexData.owner === 'unowned' && hexData.special === 'double' && <span className="hex-icon">⭐</span>}
                                {hexData.owner === 'unowned' && hexData.special === 'risk' && <span className="hex-icon">⚠️</span>}
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
};
