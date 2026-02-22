# Gameplay

Here is how Auction Tic-Tac-Toe works:

There are two players, X and O, and a 3x3 grid of squares, just like normal tic-tac-toe. Each player starts with a set amount of money, by default $15 but it's configurable with a setting. The starting player chooses a square to nominate and a starting bid; for example, if X is the starting player, they might nominate the top-left square with an opening bid of $3. Players would take turns bidding on the square until one player passes; the player who submitted the winning bid wins the square. For example, if O bids $4 and X passes, O wins the square (and spends $4), so the top-left square becomes an O. Since X nominated the last square, it becomes O's turn to nominate a square. This process repeats, with players taking turns nominating squares and bidding on them, until all squares are filled or one player gets three of their letter in a row. The win / draw condition is just like regular tic-tac-toe.

Some clarifications:

- $0 is a valid starting bid. Negative bids are not allowed.
- All bids must be made in whole-dollar increments, no decimals. There is no upper limit for a bid, other than the amount of money you have left.
- When a player cannot afford to outbid the current bid for a square, the game automatically passes for them.
- X should start the first game, and the starting player should alternate after that.

There are three configurable settings:

- Starting money (can be any non-negative integer)
- Time tiebreaker - by default disabled, in which case ties are just ties. If enabled, each player has a timer that starts at 0:00. When it's their turn to nominate or bid, the timer counts up the seconds until they finish taking their turn. Whoever spends less total time taking their turns wins in the case that neither player gets 3 in a row.

# Landing page

## Mobile layout

From top to bottom:

- Standard sticky page header
- Heading that says "Auction Tic-Tac-Toe"
- Button for "Create Room"
- Row with short text input and button for "Join Room"
- Subheading that says "How to play"
- Embedded YouTube video
- Text instructions (HTML ordered list)

## Desktop layout

Desktop layout will have the same elements as the mobile layout, but (aside from the header) it will use a two-column layout. The "How to play" and corresponding video / instructions will go in the right column, and room creation will go on the left.

## Room entry

The API endpoint to create a room is /auction-ttt/create-room. The Create Room button sends a GET request to this endpoint, and on success it receives a packet with a value `roomCode` (a string of four random capital letters not in use by any other room). Then the client navigates to /auction-ttt/game/[roomCode].

The Join Room button navigates to /auction-ttt/game/[roomCode], where `roomCode` is a capitalized version of whatever was typed in the text input field.

# State management

## Pregame stage

### Backend state

gamestage: "pregame"
settings: {
    startingMoney: number  // initial: 15
    useTiebreaker: boolean  // initial: false
}
players: {
    [Side.X]: {
        controller: number | null
    },
    [Side.O]: {
        controller: number | null
    }
}

### Actions

{
    type: "join"
    side: Side.X | Side.O
}

If the side's controller is null, set the side's controller to the viewer's ID.

{
    type: "leave"
    side: Side.X | Side.O
}

If the side is controlled by this viewer, set the side's controller to null. If a viewer disconnects and they control a side, run a leave event for each side they control.

{
    type: "changeSettings"
    settings: {
        startingMoney: number   // must be a non-negative integer
        useTiebreaker: boolean
    }
}

If the viewer is the room host, change the game settings to the newly sent settings.

{
    type: "start"
}

If the viewer is the room host, go to the nomination stage. Set each player's money to the starting money, set squares to a 3x3 grid of Side.None, set startingPlayer to Side.X, and set nominatingPlayer to startingPlayer. If useTiebreaker is true, set turnStartTime to the current time and set each player's timeTaken to 0.

## Nomination stage

### Backend state

gamestage: "nomination"
settings: {
    startingMoney: number
    useTiebreaker: boolean
}
players: {
    [Side.X]: {
        controller: number | null
        money: number
        timeTaken?: number
    },
    [Side.O]: {
        controller: number | null
        money: number
        timeTaken?: number
    }
}
squares: Side[][]
startingPlayer: Side
nominatingPlayer: Side
turnStartTime?: Date  // not sent to the viewer

### Actions

join, leave: same as in pregame stage.

{
    type: "nominate"
    row: number  // must be 0, 1, or 2
    col: number  // must be 0, 1, or 2
    startingBid: number  // must be a non-negative integer
}

If this action is submitted by the controller of the nominatingPlayer, squares[row][col] is Side.None, and startingBid is less than or equal to the nominatingPlayer's money, go to the bidding stage. Set nominatedSquare to [row, col], set currentBid to startingBid, and set biddingPlayer to the opposite of nominatingPlayer. If useTiebreaker is enabled, add the current time minus turnStartTime (in seconds) to the nominating player's timeTaken, and set turnStartTime to the current time. If the opposite player's money is less than or equal to startingBid, execute a pass action for them immediately.

## Bidding stage

### Backend state

gamestage: "bidding"
settings: {
    startingMoney: number
    useTiebreaker: boolean
}
players: {
    [Side.X]: {
        controller: number | null
        money: number
        timeTaken?: number
    },
    [Side.O]: {
        controller: number | null
        money: number
        timeTaken?: number
    }
}
squares: Side[][]
startingPlayer: Side
nominatingPlayer: Side
biddingPlayer: Side
nominatedSquare: {
    row: number
    col: number
}
currentBid: number
turnStartTime?: Date  // not sent to the viewer

### Actions

join, leave: same as in pregame stage.

{
    type: "bid"
    amount: number  // must be a non-negative integer
}

If this action is submitted by the controller of the biddingPlayer, amount is greater than currentBid, and amount is less than or equal to the nominatingPlayer's money, accept the bid. Set currentBid to amount and set biddingPlayer to the opposite of the current biddingPlayer. If useTiebreaker is enabled, update biddingPlayer's timeTaken and update turnStartTime as in the nominate action. If the opposite player's money is less than or equal to amount, execute a pass action for them immediately.

{
    type: "pass"
}

If this action is submitted by the controller of the biddingPlayer, go to the nomination stage. Set nominatingPlayer to the opposite of the current nominatingPlayer, set squares[nominatedSquare.row][nominatedSquare.column] to the opposite of biddingPlayer's side, and subtract from the money of the opposite of biddingPlayer equal to currentBid. If useTiebreaker is enabled, update biddingPlayer's timeTaken and update turnStartTime as in the nominate action. If all squares are filled or a player has gotten three of their letter in a row, go to the postgame stage. If a player has three in a row, set winner to that player; otherwise, if useTiebreaker is enabled, set winner to the player with less timeTaken; otherwise, set winner to Side.None.

## Postgame stage

### Backend state

gamestage: "postgame"
settings: {
    startingMoney: number
    useTiebreaker: boolean
}
players: {
    [Side.X]: {
        controller: number | null
        money: number
        timeTaken?: number
    },
    [Side.O]: {
        controller: number | null
        money: number
        timeTaken?: number
    }
}
squares: Side[][]
startingPlayer: Side
winner: Side

### Actions

join, leave, changeSettings: same as in pregame stage.

start: same as in pregame stage, except set startingPlayer to the opposite of the current startingPlayer.

# Frontend design

## Mobile layout

At the top of the screen, there should be a banner saying "Auction Tic-Tac-Toe" in the h1 display font. It should link back to the Auction Tic-Tac-Toe landing page.

The main portion of the page will either be the tic-tac-toe board or the game settings editor.

Below that will be a line of text instructing the user on what to do next, or the bid editor or "edit settings" button when appropriate.

The bottom of the screen will show X and O, the money they have, the time they've used if relevant, and who controls them.

## Desktop layout

At the top of the screen, there should be a banner with "Auction Tic-Tac-Toe" on the left in h1 font and the user's login status in more regular font on the right.

The tic-tac-toe board or game settings editor will occupy the center of the page.

X and O, as well as their money, time, and controllers, will be on either side of the game board / settings editor, halfway between the edge of the game board and the edge of the screen.

Below the game board will be the line of instruction text or the button to open the game settings editor. Bid editing will be done within the nominated square.