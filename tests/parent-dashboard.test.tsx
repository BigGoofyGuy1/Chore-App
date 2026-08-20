import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ParentDashboard } from '../src/screens/ParentDashboard';
import { ParentSettingsScreen } from '../src/screens/ParentSettingsScreen';
import { FamilyScreen } from '../src/screens/FamilyScreen';
import { Profile } from '../src/types';
import { buildFamilySettings } from '../src/utils/familySettings';

jest.mock('@react-native-firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  serverTimestamp: jest.fn(),
  setDoc: jest.fn(),
}));

jest.mock('../src/firebase', () => ({ db: {} }));

jest.mock('../src/utils/sendPushNotification', () => ({
  sendPushNotification: jest.fn(),
  triggerHapticSuccess: jest.fn(),
}));

jest.mock('../src/components/InviteCard', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');

  return {
    InviteCard: ({ familyCode }: { familyCode: string }) =>
      ReactModule.createElement(Text, null, `Invite Someone ${familyCode}`),
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
  it('keeps family invites out of the Review dashboard', async () => {
    const { queryByText } = await render(
      <ParentDashboard
        profile={parentProfile}
        chores={[]}
        familyMembers={[parentProfile]}
        onPressChore={jest.fn()}
        onApprove={jest.fn().mockResolvedValue(undefined)}
      />
    );

    expect(queryByText(/Invite Someone/)).toBeNull();
  });

  it('shows family invites inside Parent Settings', async () => {
    const { getByText } = await render(
      <ParentSettingsScreen
        profile={parentProfile}
        chores={[]}
        familyMembers={[parentProfile]}
        familySettings={buildFamilySettings(parentProfile.familyCode)}
      />
    );

    expect(getByText(`Invite Someone ${parentProfile.familyCode}`)).toBeOnTheScreen();
  });

  it('shows the settings gear on the parent Family screen', async () => {
    const onOpenSettings = jest.fn();
    const { getByLabelText, queryByText } = await render(
      <FamilyScreen
        profile={parentProfile}
        familyMembers={[parentProfile]}
        onSignOut={jest.fn()}
        onOpenSettings={onOpenSettings}
      />
    );

    expect(queryByText(/Invite Someone/)).toBeNull();
    fireEvent.press(getByLabelText('Open parent settings'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
