import { getNavigationWindowForTurn } from './useChatHistoryWindow'

describe('getNavigationWindowForTurn', () => {
  it('keeps real earlier turns when navigating to the latest turn', () => {
    expect(getNavigationWindowForTurn(23, 24)).toEqual({
      startTurnIndex: 14,
      endTurnIndex: 23,
    })
  })

  it('centers the target turn when there is history on both sides', () => {
    expect(getNavigationWindowForTurn(12, 24)).toEqual({
      startTurnIndex: 7,
      endTurnIndex: 16,
    })
  })

  it('clamps the window at the beginning', () => {
    expect(getNavigationWindowForTurn(1, 24)).toEqual({
      startTurnIndex: 0,
      endTurnIndex: 9,
    })
  })
})
