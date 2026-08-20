import React from 'react';
import { render } from '@testing-library/react-native';
import { ParentDashboard } from '../src/screens/ParentDashboard';
import { Profile } from '../src/types';

jest.mock('../src/components/InviteCard', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');

  return {
    InviteCard: () => ReactModule.createElement(Text, null, 'Invite Someone'),
  };
});

const parentProfile: Profile = {
  uid: 'parent-1',
  displayName: 'Parent',
  role: 'parent',
  familyCode: 'FAMILY1',
  points: 0,
};

describe('ParentDashboard', () => {
  it('keeps family invites available from the Review dashboard', async () => {
    const { getByText } = await render(
      <ParentDashboard
        profile={parentProfile}
        chores={[]}
        familyMembers={[parentProfile]}
        onPressChore={jest.fn()}
        onApprove={jest.fn().mockResolvedValue(undefined)}
      />
    );

    expect(getByText('Invite Someone')).toBeOnTheScreen();
  });
});
